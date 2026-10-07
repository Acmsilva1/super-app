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
    const schedule = { profile_id: profileId, agua_ativo: false, agua_intervalo_horas: 3, dieta_ativa: true, dieta_id: null };
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
    expect(loaded.body.row).toMatchObject({ agua_intervalo_horas: 4, dieta_ativa: true, dieta_id: null });
  });
});
