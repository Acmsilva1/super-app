import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ userId: 'owner-a', isAdmin: false }));
vi.mock('../../lib/auth.js', () => ({ requireUser: async () => ({ ok: true, user: { id: auth.userId }, isAdmin: auth.isAdmin }) }));
import handler from '../../api/saude.js';

const app = express();
app.use(express.json());
app.all('/api/saude', handler);
const profilePayload = { nome: 'Perfil teste', sexo: 'nao_informado', data_nascimento: '1990-01-01', data_medicao: '2026-01-01', peso_kg: 70, altura_cm: 170 };
const dietPayload = { titulo: 'Plano teste', refeicoes: [{ tipo: 'cafe_da_manha', itens: [{ nome: 'Ovo', quantidade: '1 unidade' }] }] };

describe('Administração dos perfis de Saúde', () => {
  it('admin ajusta água, perfil, medidas e dieta de outro usuário mantendo o dono; exclui e recria sem herdar água', async () => {
    const created = await request(app).post('/api/saude?resource=perfis').send(profilePayload);
    expect(created.status).toBe(201);
    const id = created.body.row.id;
    auth.userId = 'admin';
    auth.isAdmin = true;
    const goal = await request(app).post('/api/saude?resource=consumo-agua').send({ profile_id: id, nome: 'Garrafa', meta_doses: 6 });
    expect(goal.status).toBe(200);
    expect(goal.body.today).toMatchObject({ meta_doses: 6, realizado_doses: 0 });
    expect((await request(app).patch('/api/saude?resource=consumo-agua').send({ profile_id: id, realizado_doses: 2 })).status).toBe(200);
    expect((await request(app).patch('/api/saude?resource=perfis').send({ ...profilePayload, id, nome: 'Atualizado' })).status).toBe(200);
    const weight = await request(app).post('/api/saude?resource=perfil-medidas').send({ perfil_id: id, peso_kg: 69 });
    expect(weight.status).toBe(201);
    const measurementId = weight.body.row.historico[0].id;
    expect((await request(app).patch('/api/saude?resource=perfil-medidas').send({ id: measurementId, peso_kg: 68, altura_cm: 170, data_medicao: '2026-01-02' })).status).toBe(200);
    expect((await request(app).delete('/api/saude?resource=perfil-medidas').send({ id: measurementId })).status).toBe(200);
    const diet = await request(app).post('/api/saude?resource=dietas').send({ ...dietPayload, perfil_id: id });
    expect(diet.status).toBe(201);
    expect(diet.body.row.created_by).toBe('owner-a');
    auth.userId = 'other-user'; auth.isAdmin = false;
    expect((await request(app).patch('/api/saude?resource=dietas').send({id:diet.body.row.id,action:'alerta',alerta_ativo:true})).status).toBe(404);
    auth.userId = 'admin'; auth.isAdmin = true;
    expect((await request(app).patch('/api/saude?resource=dietas').send({id:diet.body.row.id,action:'alerta',alerta_ativo:true})).status).toBe(200);

    expect((await request(app).patch('/api/saude?resource=dietas').send({ ...dietPayload, perfil_id: id, id: diet.body.row.id, titulo: 'Ajustado' })).status).toBe(200);

    auth.userId = 'owner-a';
    auth.isAdmin = false;
    const loaded = await request(app).get(`/api/saude?resource=consumo-agua&profile_id=${id}`);
    expect(loaded.body.config).toMatchObject({ nome: 'Garrafa', meta_doses: 6 });
    expect(loaded.body.today.realizado_doses).toBe(2);
    expect((await request(app).get(`/api/saude?resource=dietas&profile_id=${id}`)).body.rows).toHaveLength(1);
    auth.userId = 'admin';
    auth.isAdmin = true;
    expect((await request(app).delete('/api/saude?resource=consumo-agua').send({ action: 'delete-goal', profile_id: id })).status).toBe(200);
    expect((await request(app).post('/api/saude?resource=consumo-agua').send({ profile_id: id, nome: 'Nova meta', meta_doses: 8 })).status).toBe(200);
    expect((await request(app).delete('/api/saude?resource=perfis').send({ id })).status).toBe(200);
    expect((await request(app).get(`/api/saude?resource=consumo-agua&profile_id=${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/saude?resource=dietas&profile_id=${id}`)).body.rows).toEqual([]);
    const recreated = await request(app).post('/api/saude?resource=perfis').send({ ...profilePayload, user_id: 'owner-a' });
    expect(recreated.status).toBe(201);
    expect(recreated.body.row.created_by).toBe('owner-a');
    expect(recreated.body.row.historico).toHaveLength(1);
    auth.userId = 'owner-a';
    auth.isAdmin = false;
    expect((await request(app).get(`/api/saude?resource=consumo-agua&profile_id=${recreated.body.row.id}`)).body.config).toBeNull();
  });

  it('usuário comum não pode ler, alterar ou excluir dados de outro dono nem criar perfil para outra conta', async () => {
    auth.userId = 'owner-b';
    auth.isAdmin = false;
    const created = await request(app).post('/api/saude?resource=perfis').send(profilePayload);
    const id = created.body.row.id;
    const measurementId = created.body.row.historico[0].id;
    auth.userId = 'intruso';
    expect((await request(app).get('/api/saude?resource=perfis')).body.rows).toEqual([]);
    expect((await request(app).post('/api/saude?resource=perfis').send({ ...profilePayload, user_id: 'owner-b' })).status).toBe(403);
    expect((await request(app).patch('/api/saude?resource=perfis').send({ ...profilePayload, id })).status).toBe(404);
    expect((await request(app).delete('/api/saude?resource=perfis').send({ id })).status).toBe(404);
    expect((await request(app).post('/api/saude?resource=consumo-agua').send({ profile_id: id, nome: 'Água', meta_doses: 8 })).status).toBe(404);
    expect((await request(app).patch('/api/saude?resource=consumo-agua').send({ profile_id: id, realizado_doses: 1 })).status).toBe(404);
    expect((await request(app).delete('/api/saude?resource=consumo-agua').send({ profile_id: id, action: 'delete-goal' })).status).toBe(404);
    expect((await request(app).patch('/api/saude?resource=perfil-medidas').send({ id: measurementId, peso_kg: 60, altura_cm: 170, data_medicao: '2026-01-01' })).status).toBe(404);
    expect((await request(app).delete('/api/saude?resource=perfil-medidas').send({ id: measurementId })).status).toBe(404);
    expect((await request(app).post('/api/saude?resource=perfil-medidas').send({ perfil_id: id, peso_kg: 60 })).status).toBe(404);
    expect((await request(app).post('/api/saude?resource=dietas').send({ ...dietPayload, perfil_id: id })).status).toBe(404);
  });
});
