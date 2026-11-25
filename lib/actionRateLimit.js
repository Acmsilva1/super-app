import crypto from 'node:crypto';
import { getAlertServiceClient } from './alertServiceClient.js';

// One atomic operation across every worker/replica; a timeout never falls back to memory.
const REDIS_WINDOW_SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n";
let redisClientPromise;

async function getRedisClient() {
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      const { createClient } = await import('redis');
      const url = process.env.REDIS_URL;
      if (!/^rediss?:\/\//.test(url || '')) throw new Error('rate_limit_redis_not_configured');
      const client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 3000, reconnectStrategy: false } });
      client.on('error', () => { /* request fails closed; never log URLs/passwords */ });
      await client.connect();
      return client;
    })();
    redisClientPromise.catch(() => { redisClientPromise = undefined; });
  }
  const client = await redisClientPromise;
  if (!client.isReady) { redisClientPromise = undefined; throw new Error('action_limit_unavailable'); }
  return client;
}

export async function consumeRedisTcpLimit(key, limit, windowSeconds, { client } = {}) {
  try {
    client ||= await getRedisClient();
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('rate_limit_timeout')), 3000); });
    let count;
    try {
      count = await Promise.race([client.eval(REDIS_WINDOW_SCRIPT, {
        keys: [`superapp:limit:${key}`], arguments: [String(windowSeconds)],
      }), timeout]);
    } finally { clearTimeout(timer); }
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('redis_invalid_result');
    return count <= limit;
  } catch { throw new Error('action_limit_unavailable'); }
}

export async function consumeRedisLimit(key, limit, windowSeconds, { env = process.env, request = fetch } = {}) {
  const url = String(env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!/^https:\/\//.test(url) || !token) throw new Error('rate_limit_redis_not_configured');
  let response;
  try {
    response = await request(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EVAL', REDIS_WINDOW_SCRIPT, '1', `superapp:limit:${key}`, String(windowSeconds)]),
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('redis_http_error');
    const body = await response.json();
    if (body.error || !Number.isSafeInteger(body.result) || body.result < 1) throw new Error('redis_invalid_result');
    return body.result <= limit;
  } catch {
    throw new Error('action_limit_unavailable');
  }
}

export async function consumeActionLimit(action,userId,limit=10,windowSeconds=60) {
  if (process.env.NODE_ENV === 'test' || process.env.OFFLINE_DEV === 'true') return true;
  if (!action || !userId || !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1) throw new Error('rate_limit_invalid_parameters');
  const key=crypto.createHash('sha256').update(`${action}:${userId}`).digest('hex');
  const backend = process.env.RATE_LIMIT_BACKEND || 'postgres';
  if (backend === 'redis') return process.env.REDIS_URL
    ? consumeRedisTcpLimit(key, limit, windowSeconds)
    : consumeRedisLimit(key, limit, windowSeconds);
  if (backend !== 'postgres') throw new Error('rate_limit_invalid_backend');
  const { data,error }=await getAlertServiceClient().rpc('consume_action_limit',{
    p_key:key,p_limit:limit,p_window_seconds:windowSeconds,
  });
  if(error) throw new Error('action_limit_unavailable');
  return data === true;
}

export async function enforceRequestLimit(req, res, { action = 'api', subject, limit = 120, windowSeconds = 60 } = {}) {
  const identity = subject || req.ip || req.socket?.remoteAddress || 'unknown';
  try {
    if (await consumeActionLimit(action, identity, limit, windowSeconds)) return true;
    res.setHeader('Retry-After', String(windowSeconds));
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Muitas tentativas. Aguarde antes de tentar novamente.' }));
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Proteção de acesso temporariamente indisponível. Tente novamente.' }));
  }
  return false;
}
