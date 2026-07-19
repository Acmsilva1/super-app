import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}));

import appsHandler, { APPS } from '../../api/apps.js';
import financeiroHandler from '../../api/financeiro.js';
import listaComprasHandler from '../../api/lista-compras.js';
import fluxogramaHandler from '../../api/fluxograma.js';
import fluxogramaExportHandler from '../../api/fluxograma-export.js';
import missoesTreinoHandler from '../../api/missoes-treino.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

const HEALTH_HANDLERS = [
  { id: 'financeiro', handler: financeiroHandler },
  { id: 'lista_compras', handler: listaComprasHandler },
  { id: 'fluxograma', handler: fluxogramaHandler },
  { id: 'fluxograma_export', handler: fluxogramaExportHandler },
  { id: 'missoes_treino', handler: missoesTreinoHandler },
];

describe('Disponibilidade das APIs', () => {
  it('catalogo expoe health_path para apps ativos', async () => {
    const app = createApp(appsHandler);
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);

    const active = APPS.filter((item) => item.status === 'active');
    expect(active.length).toBeGreaterThan(0);
    for (const item of active) {
      expect(item.health_path).toContain('health=1');
    }
  });

  it('todos os health checks respondem 200 sem depender do banco', async () => {
    for (const item of HEALTH_HANDLERS) {
      const app = createApp(item.handler);
      const res = await request(app).get('/api/test?health=1');
      expect(res.status, item.id).toBe(200);
      expect(res.body.ok, item.id).toBe(true);
    }
  });
});
