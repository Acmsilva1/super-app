import { createClient } from '@supabase/supabase-js';
import { requireUser } from './auth.js';
import { supabase } from './supabase.js';
import { consumeActionLimit } from './actionRateLimit.js';
import { isFixedAuthMode } from './authMode.js';

// Ownership comes only from the authenticated identity, never a body/query parameter.
export const PRIVACY_TABLES = Object.freeze({
  user_id: ['tb_fluxograma_projetos', 'app_user_profiles', 'app_user_roles', 'app_user_permissions', 'tb_financas', 'tb_despesas_fixas', 'tb_poupanca', 'tb_poupanca_metas', 'tb_compras', 'tb_financeiro_analises', 'tb_financeiro_features_mensais', 'tb_financeiro_analise_runs', 'tb_financeiro_modelo_estado', 'tb_financeiro_simulacoes', 'tb_financeiro_alertas', 'tb_financeiro_carne_pago'],
  created_by: ['tb_saude_perfis', 'tb_saude_perfil_medidas', 'tb_saude_dietas', 'tb_saude_agua_perfis', 'tb_saude_agua_metas', 'tb_saude_agua_logs', 'tb_saude_agua_checkins', 'tb_saude_alertas_agenda', 'tb_saude_alertas_envios', 'tb_saude_treinos', 'tb_saude_treino_blocos', 'tb_saude_treino_exercicios'],
  owner_id: ['tb_telegram_compras'],
});
function send(res, status, value) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(value);
}
const missingSchema = error => ['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error?.code);
export async function exportOwnedData(client, user) {
  const records = {};
  const unavailable = [];
  for (const [column, tables] of Object.entries(PRIVACY_TABLES)) for (const table of tables) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      if (start >= 50000) throw Error('export_too_large');
      const { data, error } = await client.from(table).select('*').eq(column, user.id).range(start, start + 999);
      if (error && missingSchema(error)) { unavailable.push(table); break; }
      if (error) throw Error('export_unavailable');
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    records[table] = rows;
  }
  return { generatedAt: new Date().toISOString(), account: { id: user.id, email: user.email }, records, unavailable, scope: 'Dados estruturados da conta nas tabelas listadas; não inclui segredos, credenciais, logs operacionais nem arquivos de terceiros.' };
}
export default async function privacyHandler(req, res) {
  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status || 401, auth.data);
  if (isFixedAuthMode() || process.env.OFFLINE_DEV === 'true') return send(res, 409, { error: 'Operação disponível apenas para contas individuais de produção.' });
  if (!await consumeActionLimit('privacy', auth.user.id, 3, 3600)) return send(res, 429, { error: 'Aguarde antes de solicitar novamente.' });
  try {
    if (req.method === 'GET') return send(res, 200, await exportOwnedData(supabase, auth.user));
    if (req.method !== 'DELETE') return send(res, 405, { error: 'Método não permitido.' });
    if (req.body?.confirmation !== 'EXCLUIR MINHA CONTA' || typeof req.body?.password !== 'string') return send(res, 400, { error: 'Confirme a exclusão e informe sua senha atual.' });
    const verifier = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await verifier.auth.signInWithPassword({ email: auth.user.email, password: req.body.password });
    if (error || data?.user?.id !== auth.user.id) return send(res, 403, { error: 'Senha atual inválida.' });
    await verifier.auth.signOut({ scope: 'local' });
    const { error: deletionError } = await supabase.rpc('delete_superapp_account_data', { p_user_id: auth.user.id });
    if (deletionError) return send(res, 503, { error: 'Exclusão indisponível. Nenhuma exclusão parcial foi confirmada; contate o administrador.' });
    return send(res, 200, { ok: true });
  } catch {
    return send(res, 503, { error: 'Operação de privacidade indisponível. Tente novamente ou contate o administrador.' });
  }
}
