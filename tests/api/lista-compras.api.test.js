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
});
