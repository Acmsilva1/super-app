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

import fluxogramaHandler from '../../api/fluxograma.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

describe('API do fluxograma', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('POST cria projeto com nome e dados vazios', async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'proj-1',
            nome: 'Projeto base',
            dados: {},
          },
          error: null,
        }),
      })),
    }));

    fromMock.mockReturnValue({
      insert,
    });

    const app = createApp(fluxogramaHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ nome: 'Projeto base', dados: {} });

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Projeto base',
        dados: {},
        updated_at: expect.any(String),
      }),
    );
    expect(res.body.nome).toBe('Projeto base');
  });

  it('PATCH atualiza apenas o nome do projeto', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'proj-1',
              nome: 'Novo nome',
            },
            error: null,
          }),
        })),
      })),
    }));

    fromMock.mockReturnValue({
      update,
    });

    const app = createApp(fluxogramaHandler);
    const res = await request(app)
      .patch('/api/test')
      .send({ id: 'proj-1', nome: 'Novo nome' });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Novo nome',
        updated_at: expect.any(String),
      }),
    );
    expect(res.body.nome).toBe('Novo nome');
  });
});
