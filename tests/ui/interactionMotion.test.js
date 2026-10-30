import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const bankTheme = fs.readFileSync(path.join(root, 'styles/bank-theme.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('feedback de interação', () => {
  it('anima o status financeiro após a renderização otimista', () => {
    expect(indexHtml).toContain('data-finance-row-id=');
    expect(indexHtml).toContain("this.playInteractionFeedback(renderedRow, 'is-status-changing')");
    expect(bankTheme).toContain('.fin-entry.is-status-changing .fin-status');
  });

  it('anima a seleção da compra após mover o item entre listas', () => {
    expect(indexHtml).toContain("this.rerenderListaCompras(el, id)");
    expect(indexHtml).toContain("this.playInteractionFeedback(changedRow, 'is-state-changing')");
    expect(bankTheme).toContain('.lc-item.is-state-changing');
  });

  it('respeita a preferência de movimento reduzido', () => {
    expect(indexHtml).toContain("window.matchMedia('(prefers-reduced-motion: reduce)')");
    expect(bankTheme).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.home-app-row/);
    expect(bankTheme).toContain('animation: none !important');
  });

  it('invalida a versão em cache do tema após alterar as animações', () => {
    expect(indexHtml).toContain('bank-theme.css?v=2026-10-30-interaction-motion-v1');
  });
});
