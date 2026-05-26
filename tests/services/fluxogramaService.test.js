import { describe, expect, it, vi } from 'vitest';

import { drawNodeShape } from '../../features/fluxograma/service/flowchartService.js';

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
  it('usa roundRect para o shape padrão quando disponível', () => {
    const { ctx, calls } = createCtx(true);

    drawNodeShape(ctx, 'rect', 10, 20, 120, 60);

    expect(ctx.roundRect).toHaveBeenCalledWith(10, 20, 120, 60, expect.any(Number));
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
  });

  it('faz fallback arredondado quando roundRect não existe', () => {
    const { ctx, calls } = createCtx(false);

    drawNodeShape(ctx, 'rect', 10, 20, 120, 60);

    expect(ctx.roundRect).toBeUndefined();
    expect(calls).toContain('quadraticCurveTo');
    expect(calls).toContain('fill');
    expect(calls).toContain('stroke');
  });
});
