// Os dados financeiros continuam isolados por user_id. O perfil e apenas o destino.
export async function resolveFinanceWhatsAppProfile(config) {
  if (config.whatsappFinanceProfile) return config.whatsappFinanceProfile;
  config.whatsappFinanceProfile = (async () => {
    const id = String(process.env.WHATSAPP_FINANCE_PROFILE_ID || '').trim();
    if (!/^[1-9][0-9]{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('whatsapp_finance_profile_required');
    const { data, error } = await config.client.from('tb_saude_perfis').select('id,created_by')
      .eq('id', id).eq('created_by', config.ownerId).maybeSingle();
    if (error) throw new Error('whatsapp_finance_profile_query_failed');
    if (!data || String(data.id) !== id || data.created_by !== config.ownerId) throw new Error('whatsapp_finance_profile_owner_mismatch');
    return id;
  })();
  return config.whatsappFinanceProfile;
}
