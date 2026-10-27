import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

describe('Painel administrativo sem teste em massa', () => {
  it('remove o botão Testar alertas do Super App', () => {
    expect(html).not.toContain('id="adminTelegramTest"');
    expect(html).not.toContain('async testAdminTelegram(');
    expect(html).not.toContain('<h4>Teste de alertas</h4>');
    expect(html).toMatch(/painel da mensageria/i);
  });
});
