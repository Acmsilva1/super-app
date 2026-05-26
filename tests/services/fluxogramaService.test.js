import { describe, expect, it, vi } from 'vitest';

import {
  drawNodeShape,
  getNearestNodePort,
} from '../../features/fluxograma/service/flowchartService.js';

function createCtx(withRoundRect = true) {
  const calls = [];
  const ctx = {
    beginPath: vi.fn(() => calls.push('beginPath')),
    fill: vi.fn(() => calls.push('fill')),
    stroke: vi.fn(() => calls.push('stroke')),
    fillRect: vi.fn(() => calls.push('fillRect')),
    strokeRect: vi.fn(() => calls.push('strokeRect')),
    moveTo: vi.fn((...args) => calls.push(['moveTo', ...args])),
    lineTo: vi.fn((...args) => calls.push(['lineTo', ...args])),
    quadraticCurveTo: vi.fn((...args) => calls.push(['quadraticCurveTo', ...args])),
    ellipse: vi.fn((...args) => calls.push(['ellipse', ...args])),
    closePath: vi.fn(() => calls.push('closePath')),
  };

  if (withRoundRect) {
    ctx.roundRect = vi.fn((...args) => calls.push(['roundRect', ...args]));
  }

  return { ctx, calls };
}

describe('drawNodeShape', () => {
  it('usa roundRect para o shape padrao quando disponivel', () => {
    const { ctx, calls } = createCtx(true);

    drawNodeShape(ctx, 'rect', 10, 20, 120, 60);

    expect(ctx.roundRect).toHaveBeenCalledWith(10, 20, 120, 60, expect.any(Number));
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
  });

  it('faz fallback arredondado quando roundRect nao existe', () => {
    const { ctx, calls } = createCtx(false);

    drawNodeShape(ctx, 'rect', 10, 20, 120, 60);

    expect(ctx.roundRect).toBeUndefined();
    expect(calls.some((call) => Array.isArray(call) && call[0] === 'quadraticCurveTo')).toBe(true);
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
  });
});

describe('getNearestNodePort', () => {
  const nodes = [
    { id: 1, x: 100, y: 100, w: 120, h: 80 },
    { id: 2, x: 320, y: 140, w: 140, h: 90 },
  ];

  it('encontra o conector mais proximo dentro do raio de magnetismo', () => {
    const hit = getNearestNodePort(nodes, 220, 140, { threshold: 24 });

    expect(hit).not.toBeNull();
    expect(hit.nodeId).toBe(1);
    expect(hit.side).toBe('right');
    expect(hit.distance).toBeLessThanOrEqual(24);
  });

  it('ignora o no de origem quando solicitado', () => {
    const hit = getNearestNodePort(nodes, 220, 140, { threshold: 24, ignoreNodeId: 1 });

    expect(hit).toBeNull();
  });
});
