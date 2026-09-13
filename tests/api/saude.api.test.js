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

  it('bloqueia métodos ainda não definidos', async () => {
    const res = await request(createApp()).post('/api/saude').send({});

    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET');
  });
});
