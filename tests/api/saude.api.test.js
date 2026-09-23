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

  it('lista o protocolo Detox e executa o CRUD de dietas', async () => {
    const app = createApp();
    const listed = await request(app).get('/api/saude?resource=dietas');

    expect(listed.status).toBe(200);
    expect(listed.body.rows[0]).toMatchObject({ slug: 'detox-7-dias-perder-peso', duracao_dias: 7 });
    expect(listed.body.rows[0].dias).toHaveLength(7);

    const payload = {
      titulo: 'Dieta de teste',
      objetivo: 'Validar CRUD',
      duracao_dias: 1,
      descricao: 'Teste',
      orientacoes_gerais: 'Orientações',
      ritual_diario: '',
      observacoes: '',
      dias: [{ numero: 1, titulo: 'Início', jejum_horas: 8, quantidade_refeicoes: 3, carboidrato: 'Livre', conteudo: 'Plano do dia' }],
    };
    const created = await request(app).post('/api/saude?resource=dietas').send(payload);
    expect(created.status).toBe(201);
    expect(created.body.row.titulo).toBe('Dieta de teste');

    const updated = await request(app).patch('/api/saude?resource=dietas').send({ ...payload, id: created.body.row.id, objetivo: 'Objetivo atualizado' });
    expect(updated.status).toBe(200);
    expect(updated.body.row.objetivo).toBe('Objetivo atualizado');

    const deleted = await request(app).delete('/api/saude?resource=dietas').send({ id: created.body.row.id });
    expect(deleted.status).toBe(200);
  });

  it('bloqueia métodos não suportados', async () => {
    const res = await request(createApp()).put('/api/saude?resource=tabelas-nutricionais').send({});

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, POST, PATCH, DELETE');
  });

  it('cria perfis, calcula IMC e registra nova linha ao alterar medidas', async () => {
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
    expect(created.body.row.historico[0].registrado_em).toContain('2024-02-15');

    const updated = await request(app).patch('/api/saude?resource=perfis').send({ ...payload, id: created.body.row.id, peso_kg: 78, data_medicao: '2023-07-09' });
    expect(updated.status).toBe(200);
    expect(updated.body.row.imc).toBe(24.07);
    expect(updated.body.row.historico).toHaveLength(2);
    expect(updated.body.row.historico[0].registrado_em).toContain('2023-07-09');

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
      const created = await request(app).post('/api/saude?resource=consumo-agua').send({
        nome: 'Garrafa 500 ml', meta_doses: 10,
      });
      expect(created.status).toBe(200);
      expect(created.body.config).toEqual({ nome: 'Garrafa 500 ml', meta_doses: 10 });
      expect(created.body.today).toMatchObject({ data: '2026-09-23', meta_doses: 10, realizado_doses: 0 });

      const checked = await request(app).patch('/api/saude?resource=consumo-agua').send({ realizado_doses: 3 });
      expect(checked.status).toBe(200);
      expect(checked.body.today.realizado_doses).toBe(3);

      vi.setSystemTime(new Date('2026-09-24T15:00:00Z'));
      const nextDay = await request(app).get('/api/saude?resource=consumo-agua');
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

      const created = await request(app).post('/api/saude?resource=consumo-agua').send({ nome: 'Copo', meta_doses: 2 });
      expect(created.status).toBe(200);
      const overflow = await request(app).patch('/api/saude?resource=consumo-agua').send({ realizado_doses: 3 });
      expect(overflow.status).toBe(409);
    } finally {
      vi.useRealTimers();
    }
  });
});
