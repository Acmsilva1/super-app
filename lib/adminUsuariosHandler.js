import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireUser } from './auth.js';
import { consumeActionLimit } from './actionRateLimit.js';
import { isFixedAuthMode } from './authMode.js';
import { runTelegramManualTest } from './telegramManualTest.js';
import { configureTelegramWebhook, getTelegramWebhookStatus } from './telegramWebhookAdmin.js';

// Keep this list aligned with modules whose data is isolated per user by the API and RLS.
const GRANTABLE_APP_IDS = new Set(['financeiro', 'saude', 'lista_compras', 'fluxograma']);

function json(res, status, data) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function getBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    db: { schema: process.env.SUPABASE_SCHEMA || 'public' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export default async function adminUsuariosHandler(req, res, APPS) {
  const auth = await requireUser(req, { adminOnly: true });
  if (!auth.ok) return json(res, auth.status, auth.data);
  if (['POST','PATCH'].includes(req.method)) {
    try {
      if (!await consumeActionLimit('admin-write',auth.user.id,20)) return json(res,429,{error:'Limite de operacoes administrativas. Aguarde um minuto.'});
    } catch { return json(res,503,{error:'Controle de acesso temporariamente indisponivel. Confira a migration de limites.'}); }
  }

  if (isFixedAuthMode()) {
    return json(res, 503, { error: 'Gestao de usuarios indisponivel com AUTH_MODE=fixed.' });
  }

  if (req.method === 'POST' && getBody(req).action === 'test_telegram') {
    const result = await runTelegramManualTest();
    return json(res, result.status, result.body);
  }

  if (req.method === 'HEAD') {
    res.status(204).end();
    return;
  }
  if (req.method === 'GET' && req.query?.resource === 'telegram_webhook') {
    const result = await getTelegramWebhookStatus(auth.user.id);
    return json(res,result.status,result.body);
  }

  const supabase = createAdminClient();
  if (!supabase) return json(res, 503, { error: 'Gestao de usuarios requer SUPABASE_SERVICE_ROLE_KEY no servidor.' });

  if (req.method === 'POST' && getBody(req).action === 'configure_telegram_webhook') {
    const result = await configureTelegramWebhook(supabase, auth.user.id, getBody(req).enabled ?? true);
    return json(res, result.status, result.body);
  }

  if (req.method === 'GET') {
    if (req.query?.resource === 'saude_monitor') {
      const requestedUserId = String(req.query?.user_id || '');
      const allUsers = requestedUserId === 'all';
      if (!allUsers && !isUuid(requestedUserId)) return json(res, 400, { error: 'Selecione um usuario valido.' });
      let monitoredUserIds = [requestedUserId];
      if (allUsers) {
        const [{ data: permittedUsers, error: permissionsError }, { data: existingProfiles, error: profilesError }] = await Promise.all([
          supabase.from('app_user_permissions').select('user_id').eq('app_id', 'saude').eq('can_access', true),
          supabase.from('tb_saude_perfis').select('created_by'),
        ]);
        if (permissionsError || profilesError) return json(res, 502, { error: 'Nao foi possivel descobrir os usuarios do modulo Saude.' });
        monitoredUserIds = [...new Set([
          auth.user.id,
          ...(permittedUsers || []).map((row) => row.user_id),
          ...(existingProfiles || []).map((row) => row.created_by),
        ].filter(isUuid))];
      }
      const queryUserIds = allUsers ? monitoredUserIds : [requestedUserId];

      const loadActivityPage = async () => {
        let query = supabase.from('tb_saude_admin_activity')
          .select('id,actor_user_id,owner_user_id,table_name,entity_id,operation,occurred_at,old_data,new_data')
          .in('owner_user_id', queryUserIds).order('occurred_at', { ascending: false }).order('id', { ascending: false }).limit(200);
        if (req.query?.before_time || req.query?.before_id) {
          const beforeTime = new Date(String(req.query.before_time || ''));
          const beforeId = String(req.query.before_id || '');
          if (!Number.isFinite(beforeTime.getTime()) || !/^\d{1,18}$/.test(beforeId)) return { error: { code: 'INVALID_CURSOR' } };
          query = query.or(`occurred_at.lt.${beforeTime.toISOString()},and(occurred_at.eq.${beforeTime.toISOString()},id.lt.${beforeId})`);
        }
        return query;
      };
      if (req.query?.history_only === '1') {
        const page = await loadActivityPage();
        if (page.error) return json(res, page.error.code === 'PGRST205' || page.error.code === '42P01' ? 200 : 400,
          page.error.code === '42P01' || page.error.code === 'PGRST205'
            ? { activity: [], activity_ready: false }
            : { error: 'Cursor de historico invalido.' });
        const rows = page.data || [];
        return json(res, 200, {
          activity: rows,
          next_activity_cursor: rows.length === 200 ? { time: rows.at(-1).occurred_at, id: rows.at(-1).id } : null,
          activity_ready: true,
        });
      }

      if (!queryUserIds.length) return json(res, 200, {
        user_id: requestedUserId, monitored_user_ids: [], profiles: [], measurements: [], diets: [],
        water_profiles: [], water_goals: [], water_logs: [], alert_schedules: [], activity: [],
        activity_ready: true, next_activity_cursor: null, alert_deliveries: [],
        alert_delivery_history_ready: true, alert_runs: [], alert_run_history_ready: true,
      });

      const profilesQuery = supabase.from('tb_saude_perfis')
        .select('id,nome,sexo,data_nascimento,data_medicao,peso_kg,altura_cm,created_by,created_at,updated_at')
        .order('created_at', { ascending: false });
      if (!allUsers) profilesQuery.eq('created_by', requestedUserId);

      const queries = await Promise.all([
        profilesQuery,
        supabase.from('tb_saude_perfil_medidas')
          .select('id,perfil_id,peso_kg,altura_cm,imc,registrado_em')
          .in('created_by', queryUserIds).order('registrado_em', { ascending: false }).limit(1000),
        supabase.from('tb_saude_agua_metas')
          .select('created_by,perfil_id,nome,meta_doses,updated_at').in('created_by', queryUserIds),
        supabase.from('tb_saude_agua_logs')
          .select('id,created_by,perfil_id,data_local,meta_doses,realizado_doses,updated_at')
          .in('created_by', queryUserIds).order('data_local', { ascending: false }).limit(1000),
        supabase.from('tb_saude_alertas_agenda')
          .select('created_by,perfil_id,agua_ativo,agua_intervalo_horas,dieta_ativa,dieta_id,updated_at').in('created_by', queryUserIds),
        loadActivityPage(),
        supabase.from('tb_saude_alertas_runs')
          .select('id,status,error_code,alerts_sent,created_at').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100),
      ]);
      const tableNames = [
        'tb_saude_perfis', 'tb_saude_perfil_medidas',
        'tb_saude_agua_metas', 'tb_saude_agua_logs', 'tb_saude_alertas_agenda',
        'tb_saude_admin_activity', 'tb_saude_alertas_runs',
      ];
      const optionalTables = new Set([
        'tb_saude_alertas_agenda',
        'tb_saude_admin_activity', 'tb_saude_alertas_runs',
      ]);
      const failedIndex = queries.findIndex((result, index) => result.error
        && !(optionalTables.has(tableNames[index]) && ['42P01', 'PGRST205'].includes(String(result.error.code))));
      if (failedIndex >= 0) {
        const failed = queries[failedIndex];
        const failedTable = tableNames[failedIndex];
        const missingAudit = failed.error.code === '42P01' || failed.error.code === 'PGRST205';
        return json(res, missingAudit ? 503 : 502, {
          error: missingAudit
            ? `Tabela ${failedTable} indisponível no banco. Confira as migrations do módulo Saúde.`
            : `Não foi possível carregar ${failedTable} no acompanhamento de Saúde.`,
        });
      }
      let alertDeliveries = await supabase.from('tb_saude_alertas_envios')
        .select('created_by,dedupe_key,status,telegram_message_id,last_error,created_at,updated_at')
        .eq('created_by', process.env.SAUDE_ALERTS_OWNER_USER_ID || auth.user.id).order('created_at', { ascending: false }).limit(100);
      if (alertDeliveries.error && ['42703', 'PGRST204'].includes(String(alertDeliveries.error.code))) {
        alertDeliveries = await supabase.from('tb_saude_alertas_envios')
          .select('created_by,dedupe_key,status,telegram_message_id,created_at,updated_at')
          .eq('created_by', process.env.SAUDE_ALERTS_OWNER_USER_ID || auth.user.id).order('created_at', { ascending: false }).limit(100);
      }
      if (alertDeliveries.error && !['42P01', 'PGRST205'].includes(String(alertDeliveries.error.code))) {
        return json(res, 502, { error: 'Nao foi possivel carregar o historico de entregas do Telegram.' });
      }
      let diets = await supabase.from('tb_saude_dietas')
        .select('id,created_by,perfil_id,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,refeicoes,meta_calorias,dias,observacoes,created_at,updated_at')
        .in('created_by', queryUserIds).order('updated_at', { ascending: false }).limit(1000);
      if (diets.error && ['42703', 'PGRST204'].includes(String(diets.error.code))) {
        diets = await supabase.from('tb_saude_dietas')
          .select('id,created_by,perfil_id,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,refeicoes,dias,observacoes,created_at,updated_at')
          .in('created_by', queryUserIds).order('updated_at', { ascending: false }).limit(1000);
      }
      if (diets.error) return json(res, 502, { error: 'Nao foi possivel carregar as dietas deste usuario.' });
      const [profiles, measurements, waterGoals, waterLogs, alertSchedules, activity, alertRuns] = queries;
      const activityRows = activity.data || [];
      return json(res, 200, {
        user_id: requestedUserId,
        monitored_user_ids: queryUserIds,
        profiles: profiles.data || [],
        measurements: measurements.data || [],
        diets: diets.data || [],
        water_profiles: (profiles.data || []).map(({ id, nome, created_by, created_at, updated_at }) => ({ id, nome, created_by, created_at, updated_at })),
        water_goals: waterGoals.data || [],
        water_logs: waterLogs.data || [],
        alert_schedules: alertSchedules.data || [],
        activity: activityRows,
        activity_ready: !activity.error,
        next_activity_cursor: activityRows.length === 200 ? { time: activityRows.at(-1).occurred_at, id: activityRows.at(-1).id } : null,
        alert_deliveries: alertDeliveries.data || [],
        alert_delivery_history_ready: !alertDeliveries.error,
        alert_runs: alertRuns.data || [],
        alert_run_history_ready: !alertRuns.error,
      });
    }

    const users = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
      if (error) return json(res, 502, { error: 'Nao foi possivel listar usuarios.' });
      users.push(...(data?.users || []));
      if (!data?.users?.length || data.users.length < 100) break;
    }

    let usuariosMap = new Map();
      let saudeProfileOwners = new Set();
    if (typeof supabase.from === 'function') {
      try {
        const { data: dbUsuarios } = await supabase.from('usuarios').select('id, username, email, name');
        if (Array.isArray(dbUsuarios)) {
          usuariosMap = new Map(dbUsuarios.map((u) => [u.id, u]));
        }
      } catch (_) {}
        try {
          const { data: profileOwners } = await supabase.from('tb_saude_perfis').select('created_by');
          saudeProfileOwners = new Set((profileOwners || []).map((row) => row.created_by));
        } catch (_) {}
    }

    const { data: permissions, error } = await supabase
      .from('app_user_permissions')
      .select('user_id,app_id,can_access');
    if (error) return json(res, 502, { error: 'Nao foi possivel carregar permissoes.' });

    return json(res, 200, {
      apps: APPS.filter(({ id }) => GRANTABLE_APP_IDS.has(id)).map(({ id, title }) => ({ id, title })),
      restricted_apps: APPS.filter(({ id }) => !GRANTABLE_APP_IDS.has(id)).map(({ id, title }) => ({ id, title })),
      users: users.map((user) => {
        const dbUser = usuariosMap.get(user.id);
        return {
          id: user.id,
          username: dbUser?.username || String(user.user_metadata?.username || user.email || ''),
          email: dbUser?.email || user.email || '',
          name: dbUser?.name || String(user.user_metadata?.name || user.user_metadata?.nome || ''),
          created_at: user.created_at,
          is_banned: Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now()),
          is_admin: user.id === auth.user.id,
          has_saude_data: saudeProfileOwners.has(user.id),
          permissions: (permissions || [])
            .filter((permission) => permission.user_id === user.id && permission.can_access)
            .map((permission) => permission.app_id),
        };
      }),
    });
  }

  if (req.method === 'POST') {
    const body = getBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const username = String(body.username || body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120) {
      return json(res, 400, { error: 'Nome ou email inválido.' });
    }
    const customPassword = body.password !== undefined;
    if (customPassword && !validPassword(body.password)) {
      return json(res, 400, { error: 'A senha deve ter entre 8 e 128 caracteres.' });
    }
    const password = customPassword ? body.password : crypto.randomBytes(24).toString('base64url');
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name, username },
    });
    if (error || !data?.user) return json(res, 400, { error: 'Não foi possível criar a conta. Verifique se o email já está cadastrado.' });

    if (typeof supabase.from === 'function') {
      try {
        await supabase.from('usuarios').upsert({
          id: data.user.id,
          username: username || email,
          email,
          name,
        }, { onConflict: 'id' });
      } catch (_) {}
    }

    return json(res, 201, { ok: true, user_id: data.user.id, ...(customPassword ? {} : { temporary_password: password }) });
  }

  if (req.method === 'PATCH') {
    const body = getBody(req);
    const userId = String(body.user_id || '');
    if (body.action === 'set_password') {
      if (!isUuid(userId) || !validPassword(body.password)) {
        return json(res, 400, { error: 'Usuário inválido ou senha fora do limite de 8 a 128 caracteres.' });
      }
      const { error } = await supabase.auth.admin.updateUserById(userId, { password: body.password });
      if (error) return json(res, 502, { error: 'Não foi possível alterar a senha. Confira também a política de senhas do Supabase.' });
      return json(res, 200, { ok: true, user_id: userId });
    }
    if (body.action === 'reset_password') {
      if (!isUuid(userId) || userId === auth.user.id) return json(res, 400, { error: 'Usuário inválido. Para sua conta, use a recuperação de senha.' });
      const password = crypto.randomBytes(24).toString('base64url');
      const { error } = await supabase.auth.admin.updateUserById(userId, { password });
      if (error) return json(res, 502, { error: 'Não foi possível redefinir a senha.' });
      return json(res, 200, { ok: true, temporary_password: password });
    }
    if (body.action === 'status') {
      if (!isUuid(userId) || typeof body.blocked !== 'boolean') {
        return json(res, 400, { error: 'Usuario ou status invalido.' });
      }
      if (userId === auth.user.id) {
        return json(res, 400, { error: 'A conta administradora nao pode ser bloqueada aqui.' });
      }
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: body.blocked ? '876000h' : 'none',
      });
      if (error) return json(res, 502, { error: 'Nao foi possivel atualizar o status da conta.' });
      return json(res, 200, { ok: true, user_id: userId, is_banned: body.blocked });
    }

    const appId = String(body.app_id || '');
    if (!isUuid(userId) || !GRANTABLE_APP_IDS.has(appId) || typeof body.can_access !== 'boolean') {
      return json(res, 400, { error: 'Usuario, modulo ou permissao invalida.' });
    }
    if (userId === auth.user.id) {
      return json(res, 400, { error: 'As permissoes da conta administradora nao podem ser alteradas aqui.' });
    }

    const { error } = await supabase
      .from('app_user_permissions')
      .upsert({ user_id: userId, app_id: appId, can_access: body.can_access }, { onConflict: 'user_id,app_id' });
    if (error) return json(res, 502, { error: 'Nao foi possivel salvar a permissao.' });
    return json(res, 200, { ok: true, user_id: userId, app_id: appId, can_access: body.can_access });
  }

  res.setHeader('Allow', 'GET, HEAD, POST, PATCH');
  return json(res, 405, { error: 'Method Not Allowed' });
}
