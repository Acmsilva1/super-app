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

import missoesTreinoHandler from '../../api/missoes-treino.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

describe('API missoes-treino', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('GET health retorna status sem consultar Supabase', async () => {
    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test?health=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'missoes_treino' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('GET ?resource=profiles lista perfis com contagem de missoes', async () => {
    const profileRows = [
      {
        id: 1,
        nome: 'Hipertrofia',
        descricao: 'Ganho de massa',
        cor: '#00e5ff',
        icone: 'fa-dumbbell',
        created_at: '2026-08-12T00:00:00Z',
        updated_at: '2026-08-12T00:00:00Z',
      },
    ];

    fromMock.mockImplementation((table) => {
      if (table === 'tb_missoes_treino_perfis') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: profileRows, error: null }),
          })),
        };
      }
      if (table === 'tb_missoes_treino') {
        return {
          select: vi.fn(() => ({
            is: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
            in: vi.fn().mockResolvedValue({ data: [{ perfil_id: 1 }], error: null }),
          })),
          update: vi.fn(() => ({
            is: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return { select: vi.fn() };
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test?resource=profiles');

    expect(res.status).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
    expect(res.body.profiles[0]).toMatchObject({
      id: 1,
      nome: 'Hipertrofia',
      missions_count: 1,
    });
  });

  it('GET ?resource=profiles adota missoes antigas sem perfil_id', async () => {
    const profileRows = [
      {
        id: 1,
        nome: 'Oficial',
        descricao: '',
        cor: '#00e5ff',
        icone: 'fa-dumbbell',
        created_at: '2026-08-12T00:00:00Z',
        updated_at: '2026-08-12T00:00:00Z',
      },
    ];
    const update = vi.fn(() => ({
      is: vi.fn().mockResolvedValue({ error: null }),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_missoes_treino_perfis') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: profileRows, error: null }),
          })),
        };
      }
      if (table === 'tb_missoes_treino') {
        return {
          select: vi.fn(() => ({
            is: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 99 }, { id: 100 }], error: null }),
            })),
            in: vi.fn().mockResolvedValue({
              data: [{ perfil_id: 1 }, { perfil_id: 1 }],
              error: null,
            }),
          })),
          update,
        };
      }
      return { select: vi.fn() };
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test?resource=profiles');

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ perfil_id: 1 });
    expect(res.body.profiles[0].missions_count).toBe(2);
  });

  it('GET sem profile_id retorna 400', async () => {
    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile_id.*obrigat/i);
  });

  it('POST resource=profile cria perfil', async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 3,
            nome: 'Corrida 5K',
            descricao: 'Prova local',
            cor: '#00d084',
            icone: 'fa-person-running',
            created_at: '2026-08-12T00:00:00Z',
            updated_at: '2026-08-12T00:00:00Z',
          },
          error: null,
        }),
      })),
    }));

    fromMock.mockReturnValue({ insert });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ resource: 'profile', nome: 'Corrida 5K', descricao: 'Prova local', cor: '#00d084' });

    expect(res.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'Corrida 5K',
        descricao: 'Prova local',
        cor: '#00d084',
      }),
    );
    expect(res.body.profile.nome).toBe('Corrida 5K');
    expect(res.body.profile.missions_count).toBe(0);
  });

  it('PATCH resource=profile atualiza perfil', async () => {
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 3,
              nome: 'Corrida 10K',
              descricao: 'Prova longa',
              cor: '#00d084',
              icone: 'fa-person-running',
            },
            error: null,
          }),
        })),
      })),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_missoes_treino_perfis') return { update };
      if (table === 'tb_missoes_treino') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      return { update };
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .patch('/api/test')
      .send({ resource: 'profile', profile_id: 3, nome: 'Corrida 10K' });

    expect(res.status).toBe(200);
    expect(res.body.profile.nome).toBe('Corrida 10K');
  });

  it('DELETE resource=profile remove perfil', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const del = vi.fn(() => ({ eq }));

    fromMock.mockReturnValue({ delete: del });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .delete('/api/test')
      .send({ resource: 'profile', profile_id: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, profile_id: 3 });
    expect(del).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith('id', 3);
  });

  it('POST missao sem profile_id retorna 400', async () => {
    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ title: 'Treino de Segunda', items: [{ name: 'Flexoes [3x12]', reps: 36 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile_id.*obrigat/i);
  });
});
