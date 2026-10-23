import { testDiagnostic } from './whatsappTestDiagnostics.js';
import { consumeActionLimit } from './actionRateLimit.js';
import { getAlertServiceClient } from './alertServiceClient.js';
import { enqueueWhatsAppAlert, whatsappAlertsEnabled } from './whatsappAlertDelivery.js';

const types = { water: 'health.water_progress', diet: 'health.diet_menu', finance: 'financeiro.daily_summary' };
const names = { water: 'Água', diet: 'Dieta', finance: 'Financeiro' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const result = (status, body) => ({ status, body });

// Somente apos requireUser(..., { adminOnly: true }) no handler administrativo.
export async function runWhatsAppManualTest(input = {}, user) {
  if (!user?.id) return result(401, { ok: false, error: 'Sessão administrativa obrigatória.' });
  if (!input || !Object.hasOwn(types, input.type) || !uuid.test(input.requestId || '')) return result(400, { ok: false, error: 'Selecione um tipo de teste válido.' });
  if (input.type !== 'finance' && (!/^[1-9][0-9]{0,14}$/.test(String(input.profileId || '')) || !Number.isSafeInteger(Number(input.profileId)))) return result(400, { ok: false, error: 'Selecione um perfil de Saúde para este teste.' });
  if (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test') return result(200, { ok: true, simulated: true, queued: 0, type: input.type });
  if (!whatsappAlertsEnabled()) return result(503, { ok: false, error: 'Ative WHATSAPP_ALERTS_ENABLED no Super App e publique um novo deploy.' });
  try {
    if (!await consumeActionLimit(`whatsapp-test:${input.type}`, user.id, 1, 60)) return result(429, { ok: false, error: 'Aguarde um minuto antes de repetir este tipo de teste.' });
  } catch { return result(503, { ok: false, error: 'Controle de testes indisponível. Confira a migration de limites.' }); }
  const diagnostics = [];
  let stage = 'client_configuration_failed';
  let audience, ownerId;
  const deadline = Date.now() + 25000;
  try {
    const client = getAlertServiceClient({ deadline });
    if (input.type === 'finance') {
      ownerId = String(process.env.SAUDE_ALERTS_OWNER_USER_ID || '').trim();
      if (!uuid.test(ownerId)) return result(503, { ok: false, error: 'Configure o proprietário financeiro em SAUDE_ALERTS_OWNER_USER_ID.' });
      audience = ownerId;
      diagnostics.push(testDiagnostic('finance_ok', 'ok'));
    } else {
      stage = 'profile_query_failed';
      const { data, error } = await client.from('tb_saude_perfis').select('id,created_by').eq('id', input.profileId).maybeSingle();
      if (error) throw new Error('profile_query_failed');
      if (!data || !uuid.test(String(data.created_by || ''))) return result(404, { ok: false, error: 'Perfil não encontrado ou sem proprietário válido.' });
      audience = String(data.id); ownerId = data.created_by;
      diagnostics.push(testDiagnostic('profile_ok', 'ok'));
    }
    stage = 'unknown_failure';
    const queued = await enqueueWhatsAppAlert({ client, ownerId, deadline }, {
      eventType: types[input.type], audience, onDiagnostic: item => diagnostics.push(item),
      title: `[TESTE MANUAL] ${names[input.type]}`,
      message: `Teste de rota do Super App para ${names[input.type]}. Identificador de destino: ${audience}. Esta é uma mensagem de teste; não representa dados reais e não altera seus registros.`,
      dedupeKey: `manual:${input.type}:${input.requestId}`
    });
    if (!queued) return result(422, { ok: false, queued: 0, diagnostics, error: 'Nenhum novo pedido foi enfileirado. Confira destinatário ativo, perfil e tipo habilitado na mensageria; se este teste já foi solicitado, confira o histórico antes de repetir.' });
    return result(200, { ok: true, simulated: false, queued: 1, type: input.type, audience, diagnostics });
  } catch (error) {
    if (!diagnostics.some(item => item.state === 'error')) diagnostics.push(testDiagnostic(error.message === 'whatsapp_config_invalid' ? 'whatsapp_config_invalid' : stage));
    const detail = [...diagnostics].reverse().find(item => item.state === 'error');
    return result(503, { ok: false, queued: 0, diagnostics, error: detail ? detail.stage + ': ' + detail.message : 'O encaminhamento não foi confirmado.' });
  }
}
