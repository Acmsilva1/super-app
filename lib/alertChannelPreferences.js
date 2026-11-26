const TABLE = 'tb_admin_alert_channels';
const ROW_ID = 'alerts';
const MISSING_TABLE = new Set(['42P01', 'PGRST205']);

export const DEFAULT_ALERT_CHANNELS = Object.freeze({ whatsapp: true });

function normalize(row) {
  if (!row) return { whatsapp: true };
  return { whatsapp: row.whatsapp_enabled !== false };
}

function rowsOf(data) {
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

export async function readAlertChannels(client) {
  const { data, error } = await client.from(TABLE).select('whatsapp_enabled').eq('id', ROW_ID);
  if (error && MISSING_TABLE.has(String(error.code))) return { whatsapp: true };
  if (error) throw new Error('alert_channels_unavailable');
  return normalize(rowsOf(data)[0]);
}

export async function writeAlertChannels(client, input) {
  const whatsapp = input?.whatsapp;
  if (typeof whatsapp !== 'boolean') {
    return { status: 400, body: { ok: false, error: 'Estado inválido.' } };
  }
  const { data, error } = await client.from(TABLE).upsert({
    id: ROW_ID,
    whatsapp_enabled: whatsapp,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' }).select('whatsapp_enabled');
  if (error && MISSING_TABLE.has(String(error.code))) {
    return { status: 503, body: { ok: false, error: 'Aplique a migration dos canais de alerta antes de salvar.' } };
  }
  if (error) return { status: 503, body: { ok: false, error: 'Não foi possível salvar os canais de alerta.' } };
  const saved = normalize(rowsOf(data)[0] || { whatsapp_enabled: whatsapp });
  return { status: 200, body: { ok: true, whatsapp: saved.whatsapp } };
}
