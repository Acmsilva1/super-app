import { supabase } from '../lib/supabase.js';

const TZ = 'America/Sao_Paulo';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function brazilParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function brazilDate(date = new Date()) {
  const { year, month, day } = brazilParts(date);
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatDateTime(dateValue, timeValue) {
  if (!dateValue) return 'Sem data';
  const date = String(dateValue).slice(0, 10).split('-').reverse().join('/');
  const time = timeValue ? String(timeValue).slice(0, 5) : null;
  return time ? `${date} ${time}` : `${date} 00:00`;
}

function toBrazilInstant(dateValue, timeValue) {
  if (!dateValue) return null;
  const date = String(dateValue).slice(0, 10);
  const time = timeValue ? String(timeValue).slice(0, 5) : '00:00';
  return new Date(`${date}T${time}:00-03:00`);
}

function isWithinNext24Hours(dateValue, timeValue, now, windowEnd) {
  const instant = toBrazilInstant(dateValue, timeValue);
  if (!instant || Number.isNaN(instant.getTime())) return false;
  return instant >= now && instant <= windowEnd;
}

function escapeTelegramMarkdown(text) {
  return String(text ?? '').replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function sendTelegramMessage(text) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'MarkdownV2',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar para Telegram: ${response.status} ${body}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'Use POST' });
  }

  if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    return json(res, 500, { error: 'TELEGRAM_TOKEN e TELEGRAM_CHAT_ID devem estar definidos.' });
  }

  try {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const today = brazilDate(now);
    const endDate = addDays(addDays(today, 1), 1);

    const { data, error } = await supabase
      .from('tb_tarefas_jobson')
      .select('id,descricao,data,slot_hora,status,notificado')
      .gte('data', today)
      .lt('data', endDate)
      .eq('status', 'pendente')
      .eq('notificado', true)
      .order('data', { ascending: true })
      .order('slot_hora', { ascending: true });

    if (error) throw new Error(`Erro ao consultar tb_tarefas_jobson: ${error.message}`);

    let enviados = 0;

    for (const row of (data || []).filter((item) => isWithinNext24Hours(item.data, item.slot_hora, now, windowEnd))) {
      const text = [
        '*TAREFAS JOBSON*',
        `*Tarefa:* ${escapeTelegramMarkdown(row.descricao || 'Sem descricao')}`,
        `*Quando:* ${escapeTelegramMarkdown(formatDateTime(row.data, row.slot_hora))}`,
      ].join('\n');

      await sendTelegramMessage(text);

      const { error: updateError } = await supabase
        .from('tb_tarefas_jobson')
        .update({ notificado: false })
        .eq('id', row.id);

      if (updateError) throw new Error(`Erro ao atualizar tb_tarefas_jobson: ${updateError.message}`);
      enviados++;
    }

    return json(res, 200, {
      status: 'ok',
      origem: 'tarefas_jobson',
      periodo: {
        referencia: today,
        janela_inicio: now.toISOString(),
        janela_fim: windowEnd.toISOString(),
        datas_consultadas: { inicio: today, fim_exclusivo: endDate },
        timezone: TZ,
      },
      enviados,
    });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}
