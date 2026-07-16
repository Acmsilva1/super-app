import { PNG } from 'pngjs';
import {
  buildExportFileName,
  getExportPageRects,
  shouldSplitIntoTwoPages,
} from '../features/fluxograma/service/exportPngService.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function parseBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function stripDataUrl(input) {
  const raw = String(input || '').trim();
  const m = raw.match(/^data:image\/png;base64,(.+)$/i);
  return m ? m[1] : raw;
}

function cropPng(src, rect) {
  const out = new PNG({ width: rect.width, height: rect.height });
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const sx = rect.x + x;
      const sy = rect.y + y;
      const si = (src.width * sy + sx) << 2;
      const di = (out.width * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

/**
 * POST { imageBase64, fileName? }
 * Se a imagem for maior que o limite, divide em no máximo 2 páginas PNG.
 */
export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health === '1') {
    return json(res, 200, { ok: true, service: 'fluxograma-export' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const body = parseBody(req);
    const b64 = stripDataUrl(body.imageBase64 || body.image || body.png);
    if (!b64) return json(res, 400, { error: 'imageBase64 obrigatorio' });

    let buffer;
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch {
      return json(res, 400, { error: 'PNG base64 invalido' });
    }
    if (!buffer.length) return json(res, 400, { error: 'PNG vazio' });

    let png;
    try {
      png = PNG.sync.read(buffer);
    } catch (e) {
      return json(res, 400, { error: e?.message || 'Falha ao ler PNG' });
    }

    const fileBase = typeof body.fileName === 'string' && body.fileName.trim()
      ? body.fileName.trim().replace(/\.png$/i, '')
      : 'fluxograma';

    const rects = getExportPageRects(png.width, png.height);
    const split = shouldSplitIntoTwoPages(png.width, png.height);
    const pages = rects.map((rect) => {
      const pageBuf = split ? cropPng(png, rect) : buffer;
      return {
        page: rect.page,
        fileName: buildExportFileName(fileBase, rect.page, rects.length),
        width: rect.width,
        height: rect.height,
        imageBase64: `data:image/png;base64,${pageBuf.toString('base64')}`,
      };
    });

    return json(res, 200, {
      ok: true,
      split,
      width: png.width,
      height: png.height,
      pageCount: pages.length,
      pages,
    });
  } catch (e) {
    return json(res, 500, { error: e?.message || 'Erro ao exportar PNG' });
  }
}
