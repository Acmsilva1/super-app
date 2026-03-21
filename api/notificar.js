import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  // --- 1. PORTEIRO (Segurança) ---
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Acesso negado." });
  }

  try {
    // --- 2. LÓGICA DE TEMPO (Vila Velha UTC-3) ---
    const agora = new Date();
    const amanha = new Date(agora.getTime() + (24 * 60 * 60 * 1000));

    // --- 3. CONSULTA AO SUPABASE ---
    const { data: eventos, error } = await supabase
      .from('compromissos') // <-- Verifique se o nome da tabela no Supabase é este
      .select('*')
      .eq('telegram_sent', false)
      .lte('data_evento', amanha.toISOString()) 
      .gte('data_evento', agora.toISOString());

    if (error) throw error;
    if (!eventos || eventos.length === 0) return res.status(200).send("Sem alertas para agora.");

    // --- 4. DISPARO TELEGRAM ---
    for (const item of eventos) {
      const msg = `🔔 *Lembrete:* ${item.descricao}\n📅 *Data:* ${new Date(item.data_evento).toLocaleString('pt-BR')}`;
      
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: msg,
          parse_mode: 'Markdown'
        })
      });

      // Marca como enviado
      await supabase.from('compromissos').update({ telegram_sent: true }).eq('id', item.id);
    }

    return res.status(200).json({ status: "Notificações enviadas!" });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
