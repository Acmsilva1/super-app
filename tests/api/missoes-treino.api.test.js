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

const WORKOUT_MISSION_ID = '7e683d74-653f-4b17-8b22-cfb1a61e0a6e';

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

  it('GET ?resource=profiles permite lista vazia sem recriar o perfil Oficial', async () => {
    const profileInsert = vi.fn();

    fromMock.mockImplementation((table) => {
      if (table === 'tb_missoes_treino_perfis') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
          insert: profileInsert,
        };
      }
      return { select: vi.fn() };
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test?resource=profiles');

    expect(res.status).toBe(200);
    expect(res.body.profiles).toEqual([]);
    expect(profileInsert).not.toHaveBeenCalled();
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
    const profileEq = vi.fn().mockResolvedValue({ error: null });
    const missionSelectEq = vi.fn().mockResolvedValue({ data: [{ id: 10 }, { id: 11 }], error: null });
    const missionDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const itemsIn = vi.fn().mockResolvedValue({ error: null });
    const flamesIn = vi.fn().mockResolvedValue({ error: null });

    fromMock.mockImplementation((table) => {
      if (table === 'tb_missoes_treino_perfis') return { delete: vi.fn(() => ({ eq: profileEq })) };
      if (table === 'tb_missoes_treino') {
        return {
          select: vi.fn(() => ({ eq: missionSelectEq })),
          delete: vi.fn(() => ({ eq: missionDeleteEq })),
        };
      }
      if (table === 'tb_missoes_treino_itens') return { delete: vi.fn(() => ({ in: itemsIn })) };
      if (table === 'tb_missoes_treino_chamas') return { delete: vi.fn(() => ({ in: flamesIn })) };
      return {};
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .delete('/api/test')
      .send({ resource: 'profile', profile_id: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, profile_id: 3 });
    expect(itemsIn).toHaveBeenCalledWith('missao_id', [10, 11]);
    expect(flamesIn).toHaveBeenCalledWith('mission_id', [10, 11]);
    expect(missionDeleteEq).toHaveBeenCalledWith('perfil_id', 3);
    expect(profileEq).toHaveBeenCalledWith('id', 3);
  });

  it('POST missao sem profile_id retorna 400', async () => {
    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ title: 'Treino de Segunda', items: [{ name: 'Flexoes [3x12]', reps: 36 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/profile_id.*obrigat/i);
  });

  it('GET preserva os treinos quando apenas o painel de desempenho falha', async () => {
    let missionsCall = 0;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    fromMock.mockImplementation((table) => {
      if (table === 'tb_missoes_treino_perfis') {
        return {
          select: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [{ id: 3, nome: 'Andre', created_at: '2026-09-01T00:00:00Z' }],
              error: null,
            }),
          })),
        };
      }
      if (table === 'tb_missoes_treino') {
        missionsCall += 1;
        if (missionsCall === 1) {
          return {
            select: vi.fn(() => ({
              is: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          };
        }
        if (missionsCall > 2) throw new Error('falha apenas na estatistica');
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({
                data: [{
                  id: WORKOUT_MISSION_ID,
                  titulo: 'Treino A',
                  data_referencia: '2026-09-24',
                  created_at: '2026-09-24T10:00:00Z',
                  perfil_id: 3,
                }],
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'tb_missoes_treino_itens') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [{
                    id: 8,
                    missao_id: WORKOUT_MISSION_ID,
                    nome: 'Supino',
                    reps: 3,
                    ordem: 1,
                    concluida: false,
                  }],
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'tb_missoes_treino_chamas') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        };
      }
      return {};
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test?profile_id=3');

    expect(res.status).toBe(200);
    expect(res.body.missions).toHaveLength(1);
    expect(res.body.missions[0].title).toBe('Treino A');
    expect(res.body.performance).toBeNull();
    expect(res.body.performance_warning).toBe('falha apenas na estatistica');
    warn.mockRestore();
  });

  it('GET workout-logs lista o historico do perfil', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [{
        id: 8,
        perfil_id: 3,
        missao_id: 10,
        treino_nome: 'Treino A',
        duracao_segundos: 125,
        finalizado_em: '2026-09-23T10:00:00Z',
      }],
      error: null,
    });
    fromMock.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({ limit })),
        })),
      })),
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test?resource=workout-logs&profile_id=3');

    expect(res.status).toBe(200);
    expect(res.body.logs[0]).toMatchObject({
      id: 8,
      workout_name: 'Treino A',
      duration_seconds: 125,
    });
  });

  it('POST workout-log registra uma sessao finalizada', async () => {
    const logInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 9,
            perfil_id: 3,
            missao_id: WORKOUT_MISSION_ID,
            treino_nome: 'Treino A',
            duracao_segundos: 3661,
            finalizado_em: '2026-09-23T10:00:00Z',
          },
          error: null,
        }),
      })),
    }));
    const flamesUpsert = vi.fn().mockResolvedValue({ error: null });

    fromMock.mockImplementation((table) => {
      if (table === 'tb_missoes_treino') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: WORKOUT_MISSION_ID, perfil_id: 3, titulo: 'Treino A' },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'tb_missoes_treino_logs') return { insert: logInsert };
      if (table === 'tb_missoes_treino_chamas') return { upsert: flamesUpsert };
      return {};
    });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ resource: 'workout-log', mission_id: WORKOUT_MISSION_ID, duration_seconds: 3661 });

    expect(res.status).toBe(201);
    expect(logInsert).toHaveBeenCalledWith(expect.objectContaining({
      perfil_id: 3,
      missao_id: WORKOUT_MISSION_ID,
      treino_nome: 'Treino A',
      duracao_segundos: 3661,
    }));
    expect(res.body.log.duration_seconds).toBe(3661);
    expect(flamesUpsert).toHaveBeenCalled();
  });

  it('DELETE workout-log remove um registro pelo id', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ delete: vi.fn(() => ({ eq })) });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .delete('/api/test')
      .send({ resource: 'workout-log', id: 9 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 9 });
    expect(eq).toHaveBeenCalledWith('id', 9);
  });

  it.each(['3abc', '3.5', '0', '-1', '', '9007199254740992'])(
    'GET rejeita profile_id numericamente malformado: %s',
    async (profileId) => {
      const app = createApp(missoesTreinoHandler);
      const res = await request(app).get(`/api/test?resource=workout-logs&profile_id=${encodeURIComponent(profileId)}`);

      expect(res.status).toBe(400);
      expect(fromMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { mission_id: '10abc', duration_seconds: 60 },
    { mission_id: 10, duration_seconds: 60 },
    { mission_id: 10.5, duration_seconds: 60 },
    { mission_id: 0, duration_seconds: 60 },
    { mission_id: 10, duration_seconds: '60abc' },
    { mission_id: 10, duration_seconds: 1.5 },
    { mission_id: 10, duration_seconds: 0 },
    { mission_id: 10, duration_seconds: 604801 },
  ])('POST workout-log rejeita payload hostil sem tocar no banco: %o', async (payload) => {
    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ resource: 'workout-log', ...payload });

    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it.each(['9abc', '9.5', '0', '-9', '9007199254740992'])(
    'DELETE workout-log rejeita id malformado sem tocar no banco: %s',
    async (id) => {
      const app = createApp(missoesTreinoHandler);
      const res = await request(app)
        .delete('/api/test')
        .send({ resource: 'workout-log', id });

      expect(res.status).toBe(400);
      expect(fromMock).not.toHaveBeenCalled();
    },
  );

  it('GET workout-logs isola a consulta pelo perfil solicitado e limita o volume', async () => {
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order }));
    fromMock.mockReturnValue({ select: vi.fn(() => ({ eq })) });

    const app = createApp(missoesTreinoHandler);
    const res = await request(app).get('/api/test?resource=workout-logs&profile_id=37');

    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalledWith('perfil_id', 37);
    expect(order).toHaveBeenCalledWith('finalizado_em', { ascending: false });
    expect(limit).toHaveBeenCalledWith(200);
  });

  it('POST missao rejeita series malformadas em vez de truncar silenciosamente', async () => {
    const app = createApp(missoesTreinoHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ profile_id: 3, title: 'Treino hostil', name: 'Agachamento', reps: '3abc' });

    expect(res.status).toBe(400);
    expect(fromMock).not.toHaveBeenCalled();
  });
});
