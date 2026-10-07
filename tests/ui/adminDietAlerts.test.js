import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const method = html.slice(html.indexOf('            async loadAdminAlerts('), html.indexOf('            async saveAdminAlerts('));
const createController = new Function('escapeHtml', `return ({${method}});`);
afterEach(() => vi.unstubAllGlobals());

describe('Painel administrativo de dietas do Telegram', () => {
  it('confirms that the test also delivered the financial summaries', async () => {
    const button = { disabled: false, textContent: '' };
    const message = { textContent: '' };
    vi.stubGlobal('document', { getElementById: (id) => id === 'adminTelegramTest' ? button : message });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, sent: 5 }) })));
    const testMethod = html.slice(html.indexOf('            async testAdminTelegram('), html.indexOf('            async loadAdminUsers('));
    await new Function(`return ({${testMethod}});`)().testAdminTelegram();
    expect(message.textContent).toContain('5 mensagem(ns)');
    expect(message.textContent).toContain('Financeiro (débito/Pix e despesas fixas)');
    expect(button.disabled).toBe(false);
  });
  it('shows the complete catalog when Juliana is selected, including diets linked to other profiles', async () => {
    const content = { innerHTML: '', dataset: {} };
    const message = { textContent: '' };
    vi.stubGlobal('document', { getElementById: (id) => id === 'adminAlertsContent' ? content : message });
    const fetchMock = vi.fn(async (url) => ({ ok: true, json: async () =>
      url.includes('resource=perfis') ? { rows: [{ id: 1, nome: 'André' }, { id: 2, nome: 'Juliana' }] }
      : url.includes('alertas-agenda') ? { row: { dieta_ativa: true, agua_intervalo_horas: 3 } }
      : { rows: [{ id: 10, perfil_id: 1, titulo: 'Plano André' }, { id: 20, perfil_id: 2, titulo: 'Emagrecimento' }, { id: 30, perfil_id: null, titulo: 'Outra dieta' }] },
    }));
    vi.stubGlobal('fetch', fetchMock);
    await createController(String).loadAdminAlerts(2);
    expect(content.innerHTML).toContain('Emagrecimento — Juliana');
    expect(content.innerHTML).toContain('Plano André — André');
    expect(content.innerHTML).toContain('Outra dieta — Perfil não vinculado');
    expect(content.innerHTML).not.toContain('Cadastre uma dieta neste perfil');
    expect(content.innerHTML).not.toContain('name="dieta_id"');
    expect(message.textContent).toContain('3 dieta(s) cadastrada(s)');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/saude?resource=dietas')).toBe(true);
  });
});
