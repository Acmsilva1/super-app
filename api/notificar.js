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

function getScope(req) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const raw = String(body.scope || req.query?.scope || 'general').trim().toLowerCase();
  return raw === 'all' ? 'all' : 'general';
}

function buildSources(scope) {
  const generalSources = [
    {
      key: 'calendario',
      table: 'tb_calendario',
      select: 'id,title,date,start_time,category',
      dateColumn: 'date',
      timeColumn: 'start_time',
      message: (row) =>
        [
          '*CALENDARIO*',
          `*Lembrete:* ${escapeTelegramMarkdown(row.title || 'Sem titulo')}`,
          `*Quando:* ${escapeTelegramMarkdown(formatDateTime(row.date, row.start_time))}`,
          row.category ? `*Categoria:* ${escapeTelegramMarkdown(row.category)}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
    },
    {
      key: 'saude',
      table: 'tb_saude_familiar',
      select: 'id,membro_familia,tipo_registro,detalhes,data_evento,hora_evento',
      dateColumn: 'data_evento',
      timeColumn: 'hora_evento',
      message: (row) =>
        [
          '*SAUDE*',
          `*Tipo:* ${escapeTelegramMarkdown(row.tipo_registro || 'Registro')}`,
          `*Pessoa:* ${escapeTelegramMarkdown(row.membro_familia || 'Nao informado')}`,
          `*Detalhes:* ${escapeTelegramMarkdown(row.detalhes || 'Sem detalhes')}`,
          `*Quando:* ${escapeTelegramMarkdown(formatDateTime(row.data_evento, row.hora_evento))}`,
        ].join('\n'),
    },
  ];

  return generalSources;
}

async function processRows(config, startDate, endDate, now, windowEnd) {
  let query = supabase
    .from(config.table)
    .select(config.select)
    .gte(config.dateColumn, startDate)
    .lt(config.dateColumn, endDate)
    .order(config.dateColumn, { ascending: true });

  if (config.pendingColumn) {
    query = query.eq(config.pendingColumn, config.pendingValue);
  } else {
    query = query.eq('telegram_sent', false);
  }

  for (const filter of config.eqFilters || []) {
    query = query.eq(filter.column, filter.value);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao consultar ${config.table}: ${error.message}`);

  let sent = 0;
  for (const row of (data || []).filter((item) => isWithinNext24Hours(item[config.dateColumn], item[config.timeColumn], now, windowEnd))) {
    await sendTelegramMessage(config.message(row));
    const sentUpdate = config.sentUpdate
      ? config.sentUpdate(row)
      : { telegram_sent: true, telegram_sent_at: new Date().toISOString() };
    const { error: updateError } = await supabase.from(config.table).update(sentUpdate).eq('id', row.id);
    if (updateError) throw new Error(`Erro ao atualizar ${config.table}: ${updateError.message}`);
    sent += 1;
  }

  return { key: config.key || config.table, sent };
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
    const scope = getScope(req);
    const sources = buildSources(scope);

    let totalEnviados = 0;
    const detalhes = [];
    for (const source of sources) {
      const result = await processRows(source, today, endDate, now, windowEnd);
      totalEnviados += result.sent;
      detalhes.push(result);
    }

    return json(res, 200, {
      status: 'ok',
      scope,
      periodo: {
        referencia: today,
        janela_inicio: now.toISOString(),
        janela_fim: windowEnd.toISOString(),
        datas_consultadas: { inicio: today, fim_exclusivo: endDate },
        timezone: TZ,
      },
      enviados: totalEnviados,
      detalhes,
    });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}
