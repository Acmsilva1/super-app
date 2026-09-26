import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import saudeHandler from '../../api/saude.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.all('/api/saude', async (req, res) => saudeHandler(req, res));
  return app;
}

describe('API de saúde', () => {
  it('responde ao health check sem acessar o banco', async () => {
    const res = await request(createApp()).get('/api/saude?health=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'saude' });
  });

  it('expõe o estado inicial do módulo', async () => {
    const res = await request(createApp()).get('/api/saude');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      module: 'saude',
      status: 'ready',
      configured: true,
    });
  });

  it('retorna os itens da tabela nutricional importados do Excel', async () => {
    const res = await request(createApp()).get('/api/saude?resource=tabelas-nutricionais');

    expect(res.status).toBe(200);
    expect(res.body.resource).toBe('tabelas-nutricionais');
    expect(res.body.storage).toBe('bundled-fallback');
    expect(res.body.total).toBe(115);
    expect(res.body.rows).toHaveLength(115);
    expect(res.body.categorias).toContain('Proteínas');
    expect(res.body.protocolos).toEqual(['Perder Peso', 'Manutenção']);
  });

  it('insere, edita e exclui um item da tabela nutricional', async () => {
    const app = createApp();
    const created = await request(app)
      .post('/api/saude?resource=tabelas-nutricionais')
      .send({ item: 'Item de teste', categoria: 'Testes', porcao: '100 g' });

    expect(created.status).toBe(201);
    expect(created.body.row).toMatchObject({ item: 'Item de teste', categoria: 'Testes', porcao: '100 g' });
    expect(created.body.row.protocolo).toBeNull();

    const updated = await request(app)
      .patch('/api/saude?resource=tabelas-nutricionais')
      .send({ id: created.body.row.id, item: 'Item editado', categoria: 'Testes', porcao: '2 unidades' });

    expect(updated.status).toBe(200);
    expect(updated.body.row).toMatchObject({ item: 'Item editado', porcao: '2 unidades' });

    const deleted = await request(app)
      .delete('/api/saude?resource=tabelas-nutricionais')
      .send({ id: created.body.row.id });

    expect(deleted.status).toBe(200);
    expect(deleted.body.ok).toBe(true);
  });

  it('valida os campos obrigatórios antes de gravar', async () => {
    const res = await request(createApp())
      .post('/api/saude?resource=tabelas-nutricionais')
      .send({ item: '', categoria: '', porcao: '' });

    expect(res.status).toBe(400);
  });

  it('inicia sem dietas antigas e executa o CRUD estruturado de dietas vinculado a um perfil', async () => {
    const app = createApp();
    const listed = await request(app).get('/api/saude?resource=dietas');

    expect(listed.status).toBe(200);
    expect(listed.body.rows).toEqual([]);

    const profileRes = await request(app).post('/api/saude?resource=perfis').send({
      nome: 'André Silva', sexo: 'masculino', data_nascimento: '1990-01-01', data_medicao: '2026-09-25',
      peso_kg: 75, altura_cm: 175,
    });
    expect(profileRes.status).toBe(201);
    const profileId = profileRes.body.row.id;

    // Tentativa sem perfil deve falhar
    const unattached = await request(app).post('/api/saude?resource=dietas').send({
      titulo: 'Dieta sem perfil',
      refeicoes: [{ tipo: 'cafe_da_manha', itens: [{ nome: 'Ovo', quantidade: '1' }] }],
    });
    expect(unattached.status).toBe(400);
    expect(unattached.body.error).toContain('perfil');

    const payload = {
      perfil_id: profileId,
      titulo: 'Dieta de teste',
      objetivo: 'Validar CRUD',
      descricao: 'Teste',
      observacoes: '',
      refeicoes: [
        { tipo: 'cafe_da_manha', itens: [{ nome: 'Ovos', quantidade: '2 unidades', observacao: 'Mexidos' }] },
        { tipo: 'almoco', itens: [{ nome: 'Arroz integral', quantidade: '100 g', observacao: '' }] },
      ],
    };
    const created = await request(app).post('/api/saude?resource=dietas').send(payload);
    expect(created.status).toBe(201);
    expect(created.body.row.titulo).toBe('Dieta de teste');
    expect(created.body.row.perfil_id).toBe(profileId);
    expect(created.body.row.refeicoes).toHaveLength(6);
    expect(created.body.row.refeicoes.find((meal) => meal.tipo === 'cafe_da_manha').itens[0]).toMatchObject({ nome: 'Ovos', quantidade: '2 unidades' });

    const filtered = await request(app).get(`/api/saude?resource=dietas&profile_id=${profileId}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.rows).toHaveLength(1);
    expect(filtered.body.rows[0].id).toBe(created.body.row.id);

    const updated = await request(app).patch('/api/saude?resource=dietas').send({ ...payload, id: created.body.row.id, objetivo: 'Objetivo atualizado' });
    expect(updated.status).toBe(200);
    expect(updated.body.row.objetivo).toBe('Objetivo atualizado');

    const deleted = await request(app).delete('/api/saude?resource=dietas').send({ id: created.body.row.id });
    expect(deleted.status).toBe(200);
  });

  it('exige alimento e quantidade nas refeições de uma nova dieta', async () => {
    const res = await request(createApp()).post('/api/saude?resource=dietas').send({
      perfil_id: 1, titulo: 'Dieta inválida', objetivo: 'Teste', refeicoes: [{ tipo: 'jantar', itens: [{ nome: 'Peixe', quantidade: '' }] }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Alimento e quantidade');
  });

  it('bloqueia métodos não suportados', async () => {
    const res = await request(createApp()).put('/api/saude?resource=tabelas-nutricionais').send({});

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST, PATCH, DELETE');
  });

  it('cria perfis, calcula IMC e registra o instante real ao alterar o peso', async () => {
    const app = createApp();
    const payload = {
      nome: 'Perfil de teste', sexo: 'masculino', data_nascimento: '1990-05-10',
      data_medicao: '2024-02-15',
      peso_kg: 80, altura_cm: 180, cintura_cm: 90, quadril_cm: null, peito_cm: null, braco_cm: null, coxa_cm: null,
    };
    const created = await request(app).post('/api/saude?resource=perfis').send(payload);
    expect(created.status).toBe(201);
    expect(created.body.row.imc).toBe(24.69);
    expect(created.body.row.historico).toHaveLength(1);
    expect(Number.isNaN(Date.parse(created.body.row.historico[0].registrado_em))).toBe(false);
    expect(created.body.row.historico[0].registrado_em).not.toContain('2024-02-15');

    const updated = await request(app).patch('/api/saude?resource=perfis').send({ ...payload, id: created.body.row.id, peso_kg: 78, data_medicao: '2023-07-09' });
    expect(updated.status).toBe(200);
    expect(updated.body.row.imc).toBe(24.07);
    expect(updated.body.row.historico).toHaveLength(2);
    expect(Date.parse(updated.body.row.historico[0].registrado_em)).toBeGreaterThanOrEqual(Date.parse(created.body.row.historico[0].registrado_em));

    const renamed = await request(app).patch('/api/saude?resource=perfis').send({ ...payload, id: created.body.row.id, nome: 'Nome atualizado', peso_kg: 78, data_medicao: '2030-12-20' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.row.historico).toHaveLength(2);
    expect(renamed.body.row.historico[0].registrado_em).toContain('2030-12-20');

    const listed = await request(app).get('/api/saude?resource=perfis');
    expect(listed.body.rows.some((profile) => profile.nome === 'Nome atualizado')).toBe(true);

    const latestMeasurement = renamed.body.row.historico[0];
    const corrected = await request(app).patch('/api/saude?resource=perfil-medidas').send({
      id: latestMeasurement.id, data_medicao: '2022-04-03', peso_kg: 77, altura_cm: 180,
      cintura_cm: 88, quadril_cm: null, peito_cm: null, braco_cm: null, coxa_cm: null,
    });
    expect(corrected.status).toBe(200);
    expect(corrected.body.row.peso_kg).toBe(77);
    expect(corrected.body.row.historico).toHaveLength(2);
    expect(corrected.body.row.historico.find((entry) => entry.id === latestMeasurement.id).registrado_em).toContain('2022-04-03');

    const olderMeasurement = corrected.body.row.historico.find((entry) => entry.id !== latestMeasurement.id);
    const deleted = await request(app).delete('/api/saude?resource=perfil-medidas').send({ id: olderMeasurement.id });
    expect(deleted.status).toBe(200);
    expect(deleted.body.ok).toBe(true);
    expect(deleted.body.row.historico).toHaveLength(1);
  });

  it('registra um novo ponto mesmo quando o peso informado nao mudou', async () => {
    const app = createApp();
    const created = await request(app).post('/api/saude?resource=perfis').send({
      nome: 'Peso repetido', sexo: 'feminino', data_nascimento: '1992-06-10',
      data_medicao: '2026-09-25', peso_kg: 65, altura_cm: 165,
    });
    const adjusted = await request(app).post('/api/saude?resource=perfil-medidas').send({
      perfil_id: created.body.row.id, peso_kg: 65,
    });

    expect(adjusted.status).toBe(201);
    expect(adjusted.body.row.historico).toHaveLength(2);
    expect(adjusted.body.row.historico[0].peso_kg).toBe(65);
    expect(Date.parse(adjusted.body.row.historico[0].registrado_em)).toBeGreaterThanOrEqual(Date.parse(created.body.row.historico[0].registrado_em));
  });

  it('rejeita perfil com data futura ou medidas fora do limite', async () => {
    const res = await request(createApp()).post('/api/saude?resource=perfis').send({
      nome: 'Invalido', sexo: 'masculino', data_nascimento: '2999-01-01', data_medicao: '2026-09-18', peso_kg: 0, altura_cm: 180,
    });
    expect(res.status).toBe(400);
  });

  it('rejeita data de medicao inexistente', async () => {
    const res = await request(createApp()).post('/api/saude?resource=perfis').send({
      nome: 'Perfil', sexo: 'masculino', data_nascimento: '1990-05-10', data_medicao: '2026-02-30', peso_kg: 80, altura_cm: 180,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Data da medicao invalida.');
  });

  it('cria meta de agua, marca doses e vira o dia preservando o log', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-23T15:00:00Z'));
      const app = createApp();
      const profileRes = await request(app).post('/api/saude?resource=perfis').send({
        nome: 'Agua teste', sexo: 'masculino', data_nascimento: '1990-01-01', data_medicao: '2026-09-23',
        peso_kg: 80, altura_cm: 180,
      });
      const profileId = profileRes.body.row.id;
      const created = await request(app).post('/api/saude?resource=consumo-agua').send({
        profile_id: profileId, nome: 'Garrafa 500 ml', meta_doses: 10,
      });
      expect(created.status).toBe(200);
      expect(created.body.config).toEqual({ nome: 'Garrafa 500 ml', meta_doses: 10 });
      expect(created.body.today).toMatchObject({ data: '2026-09-23', meta_doses: 10, realizado_doses: 0 });

      const checked = await request(app).patch('/api/saude?resource=consumo-agua').send({ profile_id: profileId, realizado_doses: 3 });
      expect(checked.status).toBe(200);
      expect(checked.body.today.realizado_doses).toBe(3);

      vi.setSystemTime(new Date('2026-09-24T15:00:00Z'));
      const nextDay = await request(app).get(`/api/saude?resource=consumo-agua&profile_id=${profileId}`);
      expect(nextDay.status).toBe(200);
      expect(nextDay.body.today).toMatchObject({ data: '2026-09-24', meta_doses: 10, realizado_doses: 0 });
      expect(nextDay.body.history[0]).toMatchObject({ data: '2026-09-23', meta_doses: 10, realizado_doses: 3 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('valida a meta e impede consumo acima do limite diario', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-25T15:00:00Z'));
      const app = createApp();
      const invalid = await request(app).post('/api/saude?resource=consumo-agua').send({ nome: '', meta_doses: 0 });
      expect(invalid.status).toBe(400);

      const profileRes = await request(app).post('/api/saude?resource=perfis').send({
        nome: 'Limite agua', sexo: 'feminino', data_nascimento: '1990-01-01', data_medicao: '2026-09-25',
        peso_kg: 60, altura_cm: 165,
      });
      const profileId = profileRes.body.row.id;
      const created = await request(app).post('/api/saude?resource=consumo-agua').send({ profile_id: profileId, nome: 'Copo', meta_doses: 2 });
      expect(created.status).toBe(200);
      const overflow = await request(app).patch('/api/saude?resource=consumo-agua').send({ profile_id: profileId, realizado_doses: 3 });
      expect(overflow.status).toBe(409);
    } finally {
      vi.useRealTimers();
    }
  });

  it('mantem consumo e progresso independentes por perfil de saude', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-26T15:00:00Z'));
      const app = createApp();
      const andreRes = await request(app).post('/api/saude?resource=perfis').send({
        nome: 'André água', sexo: 'masculino', data_nascimento: '1990-01-01', data_medicao: '2026-09-26',
        peso_kg: 80, altura_cm: 180,
      });
      const andreId = andreRes.body.row.id;
      await request(app).post('/api/saude?resource=consumo-agua')
        .send({ profile_id: andreId, nome: 'Garrafa', meta_doses: 4 });
      await request(app).patch('/api/saude?resource=consumo-agua')
        .send({ profile_id: andreId, realizado_doses: 3 });

      const julianaRes = await request(app).post('/api/saude?resource=perfis').send({
        nome: 'Juliana água', sexo: 'feminino', data_nascimento: '1992-02-02', data_medicao: '2026-09-26',
        peso_kg: 62, altura_cm: 168,
      });
      const julianaId = julianaRes.body.row.id;
      await request(app).post('/api/saude?resource=consumo-agua')
        .send({ profile_id: julianaId, nome: 'Copo', meta_doses: 6 });

      const andreLoaded = await request(app).get(`/api/saude?resource=consumo-agua&profile_id=${andreId}`);
      const julianaLoaded = await request(app).get(`/api/saude?resource=consumo-agua&profile_id=${julianaId}`);
      expect(andreLoaded.body.today.realizado_doses).toBe(3);
      expect(julianaLoaded.body.today.realizado_doses).toBe(0);
      expect(julianaLoaded.body.profiles).toEqual(expect.arrayContaining([
        expect.objectContaining({ nome: 'André água' }),
        expect.objectContaining({ nome: 'Juliana água' }),
      ]));

      const renamed = await request(app).patch('/api/saude?resource=perfis')
        .send({ id: andreId, nome: 'André renomeado', sexo: 'masculino', data_nascimento: '1990-01-01', data_medicao: '2026-09-26', peso_kg: 80, altura_cm: 180 });
      expect(renamed.status).toBe(200);
      const afterRename = await request(app).get(`/api/saude?resource=consumo-agua&profile_id=${andreId}`);
      expect(afterRename.body.profiles).toContainEqual(expect.objectContaining({ id: andreId, nome: 'André renomeado' }));

      const deletedGoal = await request(app).delete('/api/saude?resource=consumo-agua')
        .send({ action: 'delete-goal', profile_id: andreId });
      expect(deletedGoal.status).toBe(200);
      expect(deletedGoal.body.config).toBeNull();
      expect(deletedGoal.body.today).toBeNull();
      expect(deletedGoal.body.profiles).toContainEqual(expect.objectContaining({ id: andreId }));
    } finally {
      vi.useRealTimers();
    }
  });
});
