import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: fromMock,
  },
}));

import financeiroHandler from '../../api/financeiro.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

function createThenableQuery({ data = [], counters } = {}) {
  const result = Promise.resolve({ data, error: null });
  const builder = {
    select: vi.fn(() => {
      counters.selects += 1;
      return builder;
    }),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: result.then.bind(result),
    catch: result.catch.bind(result),
  };
  return builder;
}

describe('Carga do GET financeiro', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('suporta dezenas de GETs concorrentes sem explodir materializacao anual', async () => {
    const counters = { selects: 0, fromCalls: 0 };

    fromMock.mockImplementation(() => {
      counters.fromCalls += 1;
      return createThenableQuery({ data: [], counters });
    });

    const app = createApp(financeiroHandler);
    const concurrentUsers = 30;
    const started = Date.now();

    const results = await Promise.all(
      Array.from({ length: concurrentUsers }, () => request(app).get('/api/test?mes_ano=2026-07&bi=1')),
    );
    const elapsedMs = Date.now() - started;

    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(elapsedMs).toBeLessThan(15000);

    // Antes: ~24+ selects so de materializacao anual por request.
    // Depois: materializacao do mes + leituras filtradas (orcamento bem menor).
    const avgFromCalls = counters.fromCalls / concurrentUsers;
    expect(avgFromCalls).toBeLessThanOrEqual(10);
    expect(counters.selects / concurrentUsers).toBeLessThanOrEqual(10);
  });
});
