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

import listaComprasHandler from '../../api/lista-compras.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

describe('API da lista de compras', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('GET health retorna status sem consultar Supabase', async () => {
    const app = createApp(listaComprasHandler);
    const res = await request(app).get('/api/test?health=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'lista_compras' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('modo offline responde em memória sem consultar Supabase', async () => {
    vi.stubEnv('OFFLINE_DEV', 'true');
    try {
      const app = createApp(listaComprasHandler);
      const created = await request(app).post('/api/test').send({ item: 'Cafe' });
      expect(created.status).toBe(201);
      expect(created.body.item).toBe('Cafe');

      const marked = await request(app).patch('/api/test').send({ id: created.body.id, comprado: true });
      expect(marked.body.comprado).toBe(true);

      const list = await request(app).get('/api/test');
      expect(list.status).toBe(200);
      expect(list.body.rows.some((r) => r.item === 'Cafe' && r.comprado === true)).toBe(true);

      const removed = await request(app).delete('/api/test').send({ id: created.body.id });
      expect(removed.body).toEqual({ ok: true });
      expect(fromMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('edicao dos itens', () => {
  it('altera nome e quantidade sem perder comprado, categoria e unidade', async () => {
    vi.stubEnv('OFFLINE_DEV','true');
    try {
      const app=createApp(listaComprasHandler);
      const created=await request(app).post('/api/test').send({item:'Leite',quantidade:2,unidade_medida:'caixas',comprado:true,categoria:'Feira'});
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({categoria:'Feira',posicao:expect.any(Number)});
      const edited=await request(app).patch('/api/test').send({id:created.body.id,item:'Leite integral',quantidade:5,categoria:'Gelados'});
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({id:created.body.id,item:'Leite integral',quantidade:5,unidade_medida:'caixas',comprado:true,categoria:'Gelados'});
      const reordered=await request(app).patch('/api/test').send({reorder:[{id:created.body.id},{id:1}]});
      expect(reordered.status).toBe(200);
      expect(reordered.body.updated).toBeGreaterThan(0);
      const list=await request(app).get('/api/test');
      expect(list.body.categorias).toEqual(['Limpeza','Higiene','Feira','Essencial','Gelados']);
      expect(list.body.rows.find(row=>row.id===created.body.id)).toMatchObject({item:'Leite integral',quantidade:5,categoria:'Gelados'});
      expect((await request(app).delete('/api/test').send({id:created.body.id})).status).toBe(200);
    } finally {vi.unstubAllEnvs();}
  });
  it.each([{item:'   '},{item:7},{item:'x'.repeat(121)},{quantidade:0},{quantidade:-1},{quantidade:1.5},{quantidade:1000},{quantidade:null},{quantidade:true},{quantidade:''},{quantidade:'errado'}])('rejeita campos invalidos: %j', async fields => {
    vi.stubEnv('OFFLINE_DEV','true');
    try {expect((await request(createApp(listaComprasHandler)).patch('/api/test').send({id:999,...fields})).status).toBe(400);}
    finally {vi.unstubAllEnvs();}
  });
});
