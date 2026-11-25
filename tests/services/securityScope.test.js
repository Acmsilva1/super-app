import { describe, it, expect, vi } from 'vitest';
import { scopeOwnedQuery, resolveOwnedRecord } from '../../lib/scopedOwnership.js';
import { consumeRedisLimit, consumeRedisTcpLimit } from '../../lib/actionRateLimit.js';

describe('service-role ownership boundaries', () => {
  it('fails closed without trusted actor and constrains every non-admin query', () => {
    const query = { eq: vi.fn().mockReturnThis() };
    expect(() => scopeOwnedQuery(query, '')).toThrow('scope_actor_required');
    expect(scopeOwnedQuery(query, 'actor')).toBe(query);
    expect(query.eq).toHaveBeenCalledWith('created_by', 'actor');
    query.eq.mockClear();
    scopeOwnedQuery(query, 'actor', 'true');
    expect(query.eq).toHaveBeenCalledWith('created_by', 'actor');
  });
  it('denies foreign records, allows owner and trusted boolean admin only', () => {
    const record = { created_by: 'owner' };
    expect(resolveOwnedRecord(record, 'intruder')).toBeNull();
    expect(resolveOwnedRecord(record, 'intruder', 'true')).toBeNull();
    expect(resolveOwnedRecord(record, 'owner')).toBe(record);
    expect(resolveOwnedRecord(record, 'admin', true)).toBe(record);
    expect(resolveOwnedRecord({}, 'admin', true)).toBeNull();
  });
});

describe('shared persistent Redis rate limiting', () => {
  const env = { UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'test-only' };
  it('uses the same atomic counter over TCP and fails closed on Redis outage', async () => {
    const client = { eval: vi.fn(async () => 10) };
    expect(await consumeRedisTcpLimit('hash', 10, 60, { client })).toBe(true);
    expect(client.eval.mock.calls[0][1]).toEqual({ keys: ['superapp:limit:hash'], arguments: ['60'] });
    client.eval.mockResolvedValueOnce(11);
    expect(await consumeRedisTcpLimit('hash', 10, 60, { client })).toBe(false);
    client.eval.mockRejectedValueOnce(Error('offline'));
    await expect(consumeRedisTcpLimit('hash', 10, 60, { client })).rejects.toThrow('action_limit_unavailable');
  });
  it('increments and expires in a single atomic Redis script and rejects excess', async () => {
    const request = vi.fn(async () => ({ ok: true, json: async () => ({ result: 11 }) }));
    expect(await consumeRedisLimit('hash', 10, 60, { env, request })).toBe(false);
    const command = JSON.parse(request.mock.calls[0][1].body);
    expect(command[0]).toBe('EVAL'); expect(command[1]).toContain("redis.call('EXPIRE'");
    expect(command.slice(2)).toEqual(['1', 'superapp:limit:hash', '60']);
  });
  it('fails closed on provider failures or malformed results', async () => {
    for (const response of [{ ok: false }, { ok: true, json: async () => ({ result: '1' }) }]) {
      await expect(consumeRedisLimit('hash', 10, 60, { env, request: async () => response })).rejects.toThrow('action_limit_unavailable');
    }
    await expect(consumeRedisLimit('hash', 10, 60, { env: {} })).rejects.toThrow('rate_limit_redis_not_configured');
  });
});
