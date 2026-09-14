import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

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
});
