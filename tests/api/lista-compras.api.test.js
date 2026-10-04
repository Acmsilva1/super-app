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

import listaComprasHandler from '../../api/lista-compras.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

describe('API da lista de compras', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('GET health retorna status sem consultar Supabase', async () => {
    const app = createApp(listaComprasHandler);
    const res = await request(app).get('/api/test?health=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'lista_compras' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('modo offline responde em memória sem consultar Supabase', async () => {
    vi.stubEnv('OFFLINE_DEV', 'true');
    try {
      const app = createApp(listaComprasHandler);
      const created = await request(app).post('/api/test').send({ item: 'Cafe' });
      expect(created.status).toBe(201);
      expect(created.body.item).toBe('Cafe');

      const marked = await request(app).patch('/api/test').send({ id: created.body.id, comprado: true });
      expect(marked.body.comprado).toBe(true);

      const list = await request(app).get('/api/test');
      expect(list.status).toBe(200);
      expect(list.body.rows.some((r) => r.item === 'Cafe' && r.comprado === true)).toBe(true);

      const removed = await request(app).delete('/api/test').send({ id: created.body.id });
      expect(removed.body).toEqual({ ok: true });
      expect(fromMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
