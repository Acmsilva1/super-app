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

async function processRows(config, startDate, endDate) {
  const query = supabase
    .from(config.table)
    .select(config.select)
    .eq('telegram_sent', false)
    .gte(config.dateColumn, startDate)
    .lt(config.dateColumn, endDate)
    .order(config.dateColumn, { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao consultar ${config.table}: ${error.message}`);

  let sent = 0;

  for (const row of data || []) {
    const text = config.message(row);
    await sendTelegramMessage(text);

    const { error: updateError } = await supabase
      .from(config.table)
      .update({ telegram_sent: true, telegram_sent_at: new Date().toISOString() })
      .eq('id', row.id);

    if (updateError) throw new Error(`Erro ao atualizar ${config.table}: ${updateError.message}`);
    sent++;
  }

  return sent;
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
    const startDate = brazilDate();
    const endDate = addDays(startDate, 1);

    const sources = [
      {
        table: 'tb_calendario',
        select: 'id,title,date,start_time,category',
        dateColumn: 'date',
        message: (row) =>
          [
            '*📅 CALENDÁRIO*',
            `*Lembrete:* ${escapeTelegramMarkdown(row.title || 'Sem título')}`,
            `*Quando:* ${escapeTelegramMarkdown(formatDateTime(row.date, row.start_time))}`,
            row.category ? `*Categoria:* ${escapeTelegramMarkdown(row.category)}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
      },
      {
        table: 'tb_saude_familiar',
        select: 'id,membro_familia,tipo_registro,detalhes,data_evento,hora_evento',
        dateColumn: 'data_evento',
        message: (row) =>
          [
            '*🏥 SAÚDE*',
            `*Tipo:* ${escapeTelegramMarkdown(row.tipo_registro || 'Registro')}`,
            `*Pessoa:* ${escapeTelegramMarkdown(row.membro_familia || 'Não informado')}`,
            `*Detalhes:* ${escapeTelegramMarkdown(row.detalhes || 'Sem detalhes')}`,
            `*Quando:* ${escapeTelegramMarkdown(formatDateTime(row.data_evento, row.hora_evento))}`,
          ].join('\n'),
      },
    ];

    let totalEnviados = 0;
    for (const source of sources) totalEnviados += await processRows(source, startDate, endDate);

    return json(res, 200, {
      status: 'ok',
      periodo: { inicio: startDate, fim_exclusivo: endDate, timezone: TZ },
      enviados: totalEnviados,
    });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}
