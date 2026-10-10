import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ userId: 'usuario-juliana', isAdmin: false }));
vi.mock('../../lib/auth.js', () => ({ requireUser: async () => ({ ok: true, user: { id: auth.userId }, isAdmin: auth.isAdmin }) }));
import saudeHandler from '../../api/saude.js';

const app = express();
app.use(express.json());
app.all('/api/saude', saudeHandler);

describe('Agendamento de todas as dietas', () => {
  it('allows all diets without selecting an ID and lets admin manage another profile without changing its owner', async () => {
    const profile = await request(app).post('/api/saude?resource=perfis').send({
      nome: 'Juliana', sexo: 'feminino', data_nascimento: '1990-01-01', data_medicao: '2026-01-01', peso_kg: 60, altura_cm: 160,
    });
    expect(profile.status).toBe(201);
    const profileId = profile.body.row.id;
    const schedule = { profile_id: profileId, agua_ativo: false, agua_intervalo_horas: 3, agua_inicio:'08:17', agua_fim:'20:17', dieta_ativa: true, dieta_id: null, dieta_horarios:[{tipo:'almoco',horario:'12:17'}] };
    const saved = await request(app).post('/api/saude?resource=alertas-agenda').send(schedule);
    expect(saved.status).toBe(200);
    expect(saved.body.row).toMatchObject({ dieta_ativa: true, dieta_id: null });
    auth.userId = 'outro-usuario';
    expect((await request(app).post('/api/saude?resource=alertas-agenda').send(schedule)).status).toBe(404);
    auth.userId = 'administrador';
    auth.isAdmin = true;
    expect((await request(app).post('/api/saude?resource=alertas-agenda').send({ ...schedule, agua_intervalo_horas: 4 })).status).toBe(200);
    auth.userId = 'usuario-juliana';
    auth.isAdmin = false;
    const loaded = await request(app).get(`/api/saude?resource=alertas-agenda&profile_id=${profileId}`);
    expect(loaded.status).toBe(200);
    expect(loaded.body.row).toMatchObject({ agua_intervalo_horas: 4, agua_inicio:'08:17', agua_fim:'20:17', dieta_ativa: true, dieta_id: null, dieta_horarios:[{tipo:'almoco',titulo:'Almoço',horario:'12:17'}] });
    const water = await request(app).post('/api/saude?resource=alertas-agenda').send({
      profile_id: profileId, section: 'agua', agua_ativo: true, agua_intervalo_horas: 2, agua_inicio: '09:00', agua_fim: '21:00',
      dieta_ativa: false, dieta_horarios: [],
    });
    expect(water.status).toBe(200);
    expect(water.body.row).toMatchObject({ agua_intervalo_horas: 2, dieta_ativa: true, dieta_horarios: loaded.body.row.dieta_horarios });
    const diet = await request(app).post('/api/saude?resource=alertas-agenda').send({
      profile_id: profileId, section: 'dieta', dieta_ativa: true, dieta_id: null,
      dieta_horarios: [{ tipo: 'jantar', horario: '19:15' }], agua_inicio: 'inválido',
    });
    expect(diet.status).toBe(200);
    expect(diet.body.row).toMatchObject({ agua_inicio: '09:00', agua_fim: '21:00', agua_intervalo_horas: 2,
      dieta_horarios: [{tipo:'jantar',titulo:'Jantar',horario:'19:15'}] });
  });
});
