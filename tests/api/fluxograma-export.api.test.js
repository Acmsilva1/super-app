import express from 'express';
import { PNG } from 'pngjs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import exportHandler from '../../api/fluxograma-export.js';
import { MAX_SINGLE_PAGE_EDGE } from '../../features/fluxograma/service/exportPngService.js';

function createApp(handler) {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

function makePngDataUrl(width, height, fill = [30, 40, 50, 255]) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = fill[0];
    png.data[i + 1] = fill[1];
    png.data[i + 2] = fill[2];
    png.data[i + 3] = fill[3];
  }
  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

describe('API fluxograma-export', () => {
  it('GET health responde ok', async () => {
    const app = createApp(exportHandler);
    const res = await request(app).get('/api/test?health=1');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'fluxograma-export' });
  });

  it('POST retorna uma pagina quando a imagem cabe no limite', async () => {
    const app = createApp(exportHandler);
    const res = await request(app)
      .post('/api/test')
      .send({ imageBase64: makePngDataUrl(120, 80), fileName: 'demo' });

    expect(res.status).toBe(200);
    expect(res.body.split).toBe(false);
    expect(res.body.pageCount).toBe(1);
    expect(res.body.pages[0].fileName).toBe('demo.png');
    expect(res.body.pages[0].imageBase64).toMatch(/^data:image\/png;base64,/);
  });

  it('POST divide em 2 paginas quando a imagem e muito alta', async () => {
    const app = createApp(exportHandler);
    const h = MAX_SINGLE_PAGE_EDGE + 40;
    const res = await request(app)
      .post('/api/test')
      .send({ imageBase64: makePngDataUrl(200, h), fileName: 'grande' });

    expect(res.status).toBe(200);
    expect(res.body.split).toBe(true);
    expect(res.body.pageCount).toBe(2);
    expect(res.body.pages[0].fileName).toBe('grande-pagina-1.png');
    expect(res.body.pages[1].fileName).toBe('grande-pagina-2.png');
    expect(res.body.pages[0].height + res.body.pages[1].height).toBe(h);
  });
});
