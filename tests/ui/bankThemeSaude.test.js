import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const bankTheme = fs.readFileSync(path.join(root, 'styles/bank-theme.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('bank-theme — janela do Saúde (Vercel)', () => {
  it('aplica estilos de header/título/botão/conteúdo só nos filhos corretos', () => {
    expect(bankTheme).toContain('#window-saude .window-header');
    expect(bankTheme).toContain('#window-saude .window-title');
    expect(bankTheme).toContain('#window-saude .window-btn');
    expect(bankTheme).toContain('#window-saude .window-content');
    expect(bankTheme).not.toMatch(
      /#window-financeiro \.window-header,\s*\nhtml\[data-theme\] #window-saude,\s*\nhtml\[data-theme\] #window-lista_compras \.window-header/,
    );
  });

  it('esconde a home quando um módulo está aberto e ancora modais do Saúde na janela', () => {
    expect(bankTheme).toContain('body.app-module-open > header');
    expect(bankTheme).toContain('.saude-window-content');
    expect(bankTheme).toContain('#window-saude .saude-modal-backdrop');
    expect(indexHtml).toContain('syncShellForOpenModules');
    expect(indexHtml).toContain('saude-window-content');
  });
});
