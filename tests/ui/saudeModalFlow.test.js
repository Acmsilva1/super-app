// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import createDOMPurify from 'dompurify';
import { renderSaudeContent } from '../../features/saude/index.js';

const profile = { id: 1, nome: 'André', sexo: 'masculino', data_nascimento: '1990-01-01', peso_kg: 80, altura_cm: 174, historico: [] };
const diet = { id: 7, perfil_id: 1, titulo: 'Plano teste', semanal: false, refeicoes: [], meta_calorias: 2000, alerta_ativo: false };
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 25));

afterEach(() => {
  document.querySelector('[data-test-health-root]')?._cleanup?.();
  document.body.replaceChildren();
  document.getElementById('saude-module-styles')?.remove();
  vi.unstubAllGlobals();
});

it('mantém estilos após sanitização e abre dieta, edição de perfil e ajuste de peso no portal', async () => {
  const purifier = createDOMPurify(window);
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  let parsing = false;
  Object.defineProperty(Element.prototype, 'innerHTML', { ...descriptor, set(value) {
    if (parsing) return descriptor.set.call(this, value);
    parsing = true;
    try { return descriptor.set.call(this, purifier.sanitize(String(value))); }
    finally { parsing = false; }
  } });
  vi.stubGlobal('requestAnimationFrame', (callback) => setTimeout(callback, 0));
  vi.stubGlobal('__superAppRuntimeMode', 'remote');
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const resource = new URL(url, 'https://app.test').searchParams.get('resource');
    const rows = resource === 'perfis' ? [profile] : resource === 'dietas' ? [diet] : [];
    return { ok: true, json: async () => ({ rows }) };
  }));
  document.body.innerHTML = '<div id="window-saude"><div class="window-content"><div data-test-health-root></div></div></div>';
  const root = document.querySelector('[data-test-health-root]');
  try {
    await renderSaudeContent(root);
    await nextFrame();
    expect(document.getElementById('saude-module-styles')?.textContent).toContain('.saude-diet-modal');
    root.querySelector('[data-saude-action="open-profile-detail"]')?.click();
    await nextFrame();

    root.querySelector('[data-saude-action="adjust-weight"]')?.click();
    await nextFrame();
    expect(document.querySelector('#saude-modal-portal #weight-value')).not.toBeNull();
    document.querySelector('#saude-modal-portal [data-saude-action="cancel-weight-editor"]')?.click();
    await nextFrame();

    root.querySelector('[data-saude-action="edit-profile"]')?.click();
    await nextFrame();
    expect(document.querySelector('#saude-modal-portal #profile-nome')).not.toBeNull();
    document.querySelector('#saude-modal-portal [data-saude-action="cancel-profile-editor"]')?.click();
    await nextFrame();

    root.querySelector('[data-saude-action="profile-screen"][data-screen="dietas"]')?.click();
    await nextFrame();
    root.querySelector('[data-saude-action="view-diet"]')?.click();
    await nextFrame();
    expect(document.querySelector('#saude-modal-portal #diet-detail-title')?.textContent).toBe('Plano teste');
    document.querySelector('#saude-modal-portal [data-saude-action="edit-diet"]')?.click();
    await nextFrame();
    expect(document.querySelector('#saude-modal-portal #diet-titulo')?.value).toBe('Plano teste');
  } finally {
    descriptor && Object.defineProperty(Element.prototype, 'innerHTML', descriptor);
  }
});
