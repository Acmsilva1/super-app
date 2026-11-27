import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');
const bankTheme = fs.readFileSync(path.join(root, 'styles/bank-theme.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('bank-theme — janela do Saúde', () => {
  it('aplica estilos de header/título/botão/conteúdo só nos filhos corretos', () => {
    expect(bankTheme).toContain('#window-saude .window-header');
    expect(bankTheme).toContain('#window-saude .window-title');
    expect(bankTheme).toContain('#window-saude .window-btn');
    expect(bankTheme).toContain('#window-saude .window-content');
    expect(bankTheme).not.toMatch(
      /#window-financeiro \.window-header,\s*\nhtml\[data-theme\] #window-saude,\s*\nhtml\[data-theme\] #window-lista_compras \.window-header/,
    );
  });

  it('mantém o cabeçalho mobile e retorno pelos módulos sem botão de início redundante', () => {
    expect(indexHtml).toMatch(/body\.view-apps > header\s*\{\s*position: sticky;\s*top: 0;/);
    expect(indexHtml).not.toContain('id="headerHomeBtn"');
    expect(indexHtml).toContain('aria-label="Voltar para a tela inicial"');
    expect(indexHtml).not.toContain('syncShellForOpenModules');
  });

  it('padroniza dietas, agendadores e treino no tema bancário', () => {
    expect(bankTheme).toContain('.saude-diet-item');
    expect(bankTheme).toContain('.saude-diet-alert-switch');
    expect(bankTheme).toContain('.saude-alert-panel');
    expect(bankTheme).toContain('.saude-alert-diet-list');
    expect(bankTheme).toContain('.training-prototype');
    expect(bankTheme).toContain('--training-green: var(--bk-primary)');
  });

  it('mantém o visual escuro do Saúde (estrutura fin-*, não limpeza Santander)', () => {
    expect(bankTheme).toContain('Saúde: estrutura fin-* + visual escuro original');
    expect(bankTheme).toContain('--saude-verde: #327746');
    expect(bankTheme).toContain('--saude-lima: #95c11f');
    expect(bankTheme).toContain('color-scheme: dark');
    expect(bankTheme).toContain('#saude-modal-portal .saude-modal-backdrop');
    expect(bankTheme).not.toContain('--bk-bg: #ffffff');
  });
});
