import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const authState = vi.hoisted(() => ({ isAdmin: true }));
vi.mock('../../lib/auth.js', () => ({ requireUser: async () => ({ ok: true, isAdmin: authState.isAdmin,
  user: { id: 'f88a6351-317d-425b-afcd-9430c8a34f53' } }) }));
import handler from '../../api/saude.js';
const app = express();
app.use(express.json());
app.all('/api/saude', handler);
const getFoods = () => request(app).get('/api/saude?resource=alimentos');
async function profile() {
  const result = await request(app).post('/api/saude?resource=perfis').send({ nome: 'Perfil nutricional', sexo: 'masculino', data_nascimento: '1990-01-01', data_medicao: '2026-10-07', peso_kg: 80, altura_cm: 180 });
  expect(result.status).toBe(201);
  return result.body.row.id;
}
describe('catálogo e dietas integrados em memória', () => {
  beforeEach(() => { authState.isAdmin = true; });
  it('calcula uma dieta em unidades e devolve a nutrição também na consulta', async () => {
    const foods = await getFoods();
    const egg = foods.body.rows.find((food) => food.item === 'Ovo inteiro');
    const body = { perfil_id: await profile(), titulo: 'Dieta com ovos', refeicoes: [{ tipo: 'almoco', itens: [{ nome: 'Texto não confiável', alimento_id: egg.id, quantidade_valor: 2, quantidade_unidade: 'un' }] }] };
    const created = await request(app).post('/api/saude?resource=dietas').send(body);
    expect(created.status).toBe(201);
    expect(created.body.row.nutricao_total).toMatchObject({ kcal: 143, proteina: 12.6, completo: true });
    expect(created.body.row.refeicoes[2].itens[0]).toMatchObject({ nome: 'Ovo inteiro', quantidade: '2 unidades', quantidade_valor: 2, quantidade_unidade: 'un', nutricao: { kcal: 143 } });
    const listed = await request(app).get(`/api/saude?resource=dietas&profile_id=${body.perfil_id}`);
    expect(listed.body.rows[0].nutricao_total.kcal).toBe(143);
  });
  it('salva Outros na dieta e no catálogo, permitindo reutilizar o mesmo ID', async () => {
    const food = { item: 'Alimento cadastrado pela dieta', categoria: 'Outros', porcao: '100 g', peso_referencia_g: 100, peso_unidade_g: 40, kcal_100g: 400, proteina_100g: 10, carboidrato_100g: 50, gordura_100g: 10 };
    const payload = { perfil_id: await profile(), titulo: 'Dieta com novo alimento', refeicoes: [{ tipo: 'jantar', itens: [{ nome: food.item, quantidade_valor: 2, quantidade_unidade: 'un' }] }], novo_alimento: food, novo_alimento_destino: { refeicao: 'jantar', indice: 0 } };
    const saved = await request(app).post('/api/saude?resource=dietas').send(payload);
    expect(saved.status).toBe(201);
    expect(saved.body.row.nutricao_total).toMatchObject({ kcal: 320, proteina: 8, carboidrato: 40, gordura: 8 });
    const foods = await getFoods();
    expect(foods.body.rows.filter((row) => row.item === food.item)).toHaveLength(1);
    expect(saved.body.row.refeicoes[4].itens[0].alimento_id).toBe(saved.body.food.id);
    const reused = await request(app).patch('/api/saude?resource=dietas').send({ ...payload, id: saved.body.row.id });
    expect(reused.status).toBe(200);
    expect(reused.body.food.id).toBe(saved.body.food.id);
  });
  it('não grava alimento quando a dieta ou a quantidade é inválida', async () => {
    const before = await getFoods();
    const payload = { perfil_id: await profile(), titulo: 'Dieta inválida', refeicoes: [{ tipo: 'jantar', itens: [{ nome: 'Novo inválido', quantidade_valor: -1, quantidade_unidade: 'g' }] }], novo_alimento: { item: 'Novo inválido' }, novo_alimento_destino: { refeicao: 'jantar', indice: 0 } };
    const invalid = await request(app).post('/api/saude?resource=dietas').send(payload);
    expect(invalid.status).toBe(400);
    expect((await getFoods()).body.total).toBe(before.body.total);
  });
  it('calcula dietas antigas pelo nome sem exigir recriação', async () => {
    const perfil_id = await profile();
    const saved = await request(app).post('/api/saude?resource=dietas').send({ perfil_id, titulo: 'Dieta antiga', refeicoes: [{ tipo: 'cafe_da_manha', itens: [{ nome: 'OVO INTEIRO', quantidade: '1 unidade', calorias: 999 }] }] });
    expect(saved.status).toBe(201);
    const listed = await request(app).get(`/api/saude?resource=dietas&profile_id=${perfil_id}`);
    expect(listed.body.rows[0].nutricao_total).toMatchObject({ kcal: 71.5, proteina: 6.3, completo: true });
    expect(listed.body.rows[0].refeicoes[0].itens[0].alimento.item).toBe('Ovo inteiro');
  });
  it('recusa unidades quando o catálogo não contém o peso de uma unidade', async () => {
    const foods = await getFoods();
    const chicken = foods.body.rows.find((food) => food.item === 'Peito de frango grelhado');
    const result = await request(app).post('/api/saude?resource=dietas').send({ perfil_id: await profile(), titulo: 'Quantidade sem conversão', refeicoes: [{ tipo: 'almoco', itens: [{ nome: chicken.item, alimento_id: chicken.id, quantidade_valor: 2, quantidade_unidade: 'un' }] }] });
    expect(result.status).toBe(400);
    expect(result.body.error).toContain('peso por unidade');
  });
  it('não cria um alimento para um perfil inexistente', async () => {
    const before = await getFoods();
    const item = { item: 'Não pode ficar órfão', categoria: 'Outros', porcao: '100 g', peso_referencia_g: 100, kcal_100g: 100, proteina_100g: 10, carboidrato_100g: 10, gordura_100g: 2 };
    const result = await request(app).post('/api/saude?resource=dietas').send({ perfil_id: 9999999, titulo: 'Perfil inválido', refeicoes: [{ tipo: 'almoco', itens: [{ nome: item.item, quantidade_valor: 100, quantidade_unidade: 'g' }] }], novo_alimento: item, novo_alimento_destino: { refeicao: 'almoco', indice: 0 } });
    expect(result.status).toBe(404);
    expect((await getFoods()).body.total).toBe(before.body.total);
  });
  it('bloqueia cadastro no catálogo para não administradores', async () => {
    const perfil_id = await profile();
    authState.isAdmin = false;
    const result = await request(app).post('/api/saude?resource=dietas').send({ perfil_id, titulo: 'Sem permissão', refeicoes: [{ tipo: 'almoco', itens: [{ nome: 'Novo', quantidade: '100 g' }] }], novo_alimento: { item: 'Novo' } });
    expect(result.status).toBe(403);
    expect((await getFoods()).body.admin_view).toBe(false);
  });
});
