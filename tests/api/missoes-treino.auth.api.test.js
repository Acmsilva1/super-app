import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, requireUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  requireUserMock: vi.fn(),
}));

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: fromMock },
}));

vi.mock('../../lib/auth.js', () => ({
  requireUser: requireUserMock,
}));

import missoesTreinoHandler from '../../api/missoes-treino.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.all('/api/test', missoesTreinoHandler);
  return app;
}

describe('autorizacao da API missoes-treino', () => {
  beforeEach(() => {
    fromMock.mockReset();
    requireUserMock.mockReset();
  });

  it('bloqueia leitura de logs sem autenticacao antes de consultar o banco', async () => {
    requireUserMock.mockResolvedValue({
      ok: false,
      status: 401,
      data: { error: 'Nao autorizado' },
    });

    const res = await request(createApp()).get('/api/test?resource=workout-logs&profile_id=3');

    expect(res.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('exige permissao administrativa para acessar qualquer recurso protegido', async () => {
    requireUserMock.mockResolvedValue({
      ok: false,
      status: 403,
      data: { error: 'Acesso negado' },
    });

    const res = await request(createApp())
      .post('/api/test')
      .send({ resource: 'workout-log', mission_id: 10, duration_seconds: 60 });

    expect(res.status).toBe(403);
    expect(requireUserMock).toHaveBeenCalledWith(
      expect.anything(),
      { appId: 'missoes_treino', adminOnly: true },
    );
    expect(fromMock).not.toHaveBeenCalled();
  });
});
