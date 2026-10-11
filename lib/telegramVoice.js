const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
import { unsupportedPurchaseIntent } from './purchaseRules.js';
const MAX_AUDIO_SECONDS = 60;

function normalizeWords(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

const units = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
function numberWords(value) {
  if (value < 10) return units[value];
  if (value < 20) return teens[value - 10];
  if (value < 100) return tens[Math.floor(value / 10)] + (value % 10 ? ` e ${units[value % 10]}` : '');
  if (value === 100) return 'cem';
  return hundreds[Math.floor(value / 100)] + (value % 100 ? ` e ${numberWords(value % 100)}` : '');
}
const spokenIntegers = new Map(Array.from({ length: 1000 }, (_, n) => [numberWords(n), n]));
spokenIntegers.set('uma', 1);
spokenIntegers.set('duas', 2);
spokenIntegers.set('catorze', 14);
function integerValue(raw) {
  const words = normalizeWords(raw);
  if (/^\d{1,7}$/.test(words)) return Number(words);
  if (spokenIntegers.has(words)) return spokenIntegers.get(words);
  const thousands = words.match(/^(?:(.+) )?mil(?: (?:e )?(.+))?$/);
  if (!thousands) return null;
  const upper = thousands[1] ? spokenIntegers.get(thousands[1]) : 1;
  const lower = thousands[2] ? spokenIntegers.get(thousands[2]) : 0;
  return upper > 0 && lower !== undefined ? upper * 1000 + lower : null;
}

function amountValue(raw) {
  const text = normalizeWords(raw).replace(/^r\$\s*/, '');
  const numeric = text.match(/^(\d{1,7}(?:[,.]\d{1,2})?)(?: reais?| real)?$/);
  if (numeric) return Number(numeric[1].replace(',', '.'));
  const decimal = text.match(/^(.+?)\s*(?:virgula|,)\s*(.+?)(?: reais?| real)?$/);
  if (decimal) {
    const whole = integerValue(decimal[1]), cents = integerValue(decimal[2]);
    if (whole === null || cents === null || cents < 0 || cents > 99) return null;
    // Spoken digits are decimal places; "dez vírgula dois" means 10,2.
    const fraction = /^(?:\d|zero|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)$/.test(decimal[2]) ? cents / 10 : cents / 100;
    return whole + fraction;
  }
  const currency = text.match(/^(.+?) (?:reais|real)(?: e (.+?)(?: centavos?)?)?$/);
  if (currency) {
    const whole = integerValue(currency[1]);
    const cents = currency[2] ? integerValue(currency[2]) : 0;
    if (whole === null || cents === null || cents < 0 || cents > 99) return null;
    return whole + cents / 100;
  }
  const centsOnly = text.match(/^(.+?) centavos?$/);
  if (centsOnly) {
    const cents = integerValue(centsOnly[1]);
    return cents !== null && cents >= 0 && cents <= 99 ? cents / 100 : null;
  }
  const integer = integerValue(text);
  if (integer !== null) return integer;
  // Colloquial currency: "quinze e trinta" means 15 reais and 30 centavos.
  // Full integer phrases win first: "vinte e cinco" remains 25 reais.
  const amounts = new Set();
  for (const match of text.matchAll(/\s+e\s+/g)) {
    const whole = integerValue(text.slice(0,match.index));
    const cents = integerValue(text.slice(match.index+match[0].length));
    if (whole !== null && cents !== null && cents >= 0 && cents <= 99) amounts.add(whole+cents/100);
  }
  return amounts.size === 1 ? [...amounts][0] : null;
}

// A bounded purchase phrase, not an unrestricted natural-language financial agent.
export function normalizeVoicePurchase(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 500) return null;
  if (unsupportedPurchaseIntent(text)) return null;
  const original = text.trim().replace(/[.!?]+$/, '').trim();
  if (/\b(?:e|mais)\s+(?:comprei|paguei|gastei)\b/i.test(original)) return null;
  const clean = original.replace(/\bvírgula\b|\bvirgula\b/gi, ',')
    .replace(/^(?:eu\s+)?(?:comprei|paguei|gastei)\s+/i, '').trim();
  const candidates = new Map();
  const addCandidate = (description, amount) => {
    description = description.trim().replace(/(?:\s+(?:por|no valor de|valor de|custou|deu))\s*$/i, '').trim().replace(/[,;:]$/, '').trim();
    if (!description || /[,;:\n]/.test(description) || /\b(?:reais?|centavos?)\b/i.test(description)
      || /\b\d+(?:[,.]\d+)?\b/.test(description)
      || /\b(?:dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil)\b/.test(normalizeWords(description))
      || /\b(?:e|menos)$|[+-]$/i.test(description)) return;
    if (amount === null || !Number.isFinite(amount) || amount <= 0 || amount >= 10000000) return;
    const canonical = `${description}, ${amount.toFixed(2).replace('.', ',')}`;
    candidates.set(canonical, canonical);
  };
  // Amount first: "gastei dez reais e vinte centavos no café".
  if (/^(?:eu\s+)?(?:paguei|gastei)\s+/i.test(original)) {
    const amountFirst = clean.match(/^(.+?)\s+(?:no|na|em|com|pelo|pela)\s+(.+)$/i);
    if (amountFirst) addCandidate(amountFirst[2], amountValue(amountFirst[1]));
  }
  for (let i = 1; i < clean.length; i++) {
    if (!/[\s,;:]/.test(clean[i])) continue;
    const description = clean.slice(0, i).trim().replace(/[,;:]$/, '').trim();
    const rawAmount = clean.slice(i + 1).trim();
    addCandidate(description, amountValue(rawAmount));
  }
  return candidates.size === 1 ? [...candidates.values()][0] : null;
}

export function voiceErrorMessage(error) {
  const messages = {
    audio_limit: 'Envie um áudio de até 60 segundos e 5 MB, com apenas uma compra.',
    groq_missing: 'A transcrição ainda não está configurada no servidor. Envie descrição e valor por texto.',
    groq_rate_limit: 'A cota de transcrição está temporariamente esgotada. Envie a compra por texto ou tente mais tarde.',
    groq_auth: 'Não foi possível autenticar a transcrição. Confira a variável da Groq na Vercel. Você pode enviar por texto.',
  };
  return messages[error?.message] || 'Não consegui transcrever esse áudio. Nada foi salvo. Tente novamente ou envie descrição e valor por texto.';
}

async function limitedBytes(response) {
  if (!response.ok || !response.body) throw new Error('audio_download_failed');
  if (Number(response.headers.get('content-length') || 0) > MAX_AUDIO_BYTES) throw new Error('audio_limit');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error('audio_limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!size) throw new Error('audio_download_failed');
  return Buffer.concat(chunks, size);
}

export async function transcribeTelegramVoice(voice, telegramCall) {
  if (!voice || !Number.isInteger(voice.duration) || voice.duration < 1 || voice.duration > MAX_AUDIO_SECONDS
    || (voice.file_size !== undefined && (!Number.isSafeInteger(voice.file_size) || voice.file_size < 1 || voice.file_size > MAX_AUDIO_BYTES))
    || typeof voice.file_id !== 'string' || voice.file_id.length > 512) throw new Error('audio_limit');
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('groq_missing');
  const file = await telegramCall('getFile', { file_id: voice.file_id });
  if (file?.file_size > MAX_AUDIO_BYTES) throw new Error('audio_limit');
  // Never forward Telegram's token-bearing download URL to the transcription provider.
  if (!/^voice\/[A-Za-z0-9_-]+\.oga$/.test(file?.file_path || '')
    && !/^voice\/[A-Za-z0-9_-]+\.ogg$/.test(file?.file_path || '')) throw new Error('audio_download_failed');
  let bytes;
  try {
    const response = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`, {
      redirect: 'error', signal: AbortSignal.timeout(8000),
    });
    bytes = await limitedBytes(response);
  } catch (error) {
    if (error?.message === 'audio_limit') throw error;
    throw new Error('audio_download_failed');
  }
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'audio/ogg' }), 'purchase.ogg');
  form.set('model', 'whisper-large-v3');
  form.set('language', 'pt');
  form.set('response_format', 'json');
  form.set('temperature', '0');
  // No purchase examples in the prompt: avoid suggesting a value on silent audio.
  let response;
  try {
    response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
      redirect: 'error', signal: AbortSignal.timeout(18000),
    });
  } catch { throw new Error('groq_unavailable'); }
  if (response.status === 429) throw new Error('groq_rate_limit');
  if ([401, 403].includes(response.status)) throw new Error('groq_auth');
  if (!response.ok) throw new Error('groq_unavailable');
  let payload;
  try { payload = await response.json(); } catch { throw new Error('groq_invalid_response'); }
  if (typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 500) throw new Error('groq_invalid_response');
  return payload.text.trim();
}
