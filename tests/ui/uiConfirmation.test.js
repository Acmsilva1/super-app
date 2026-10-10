import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { showAppConfirmation } from '../../lib/uiConfirmation.js';

let nodes;
beforeEach(() => {
  vi.useFakeTimers();
  nodes = [];
  const element = () => ({ children: [], attributes: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    append(...items) { this.children.push(...items); nodes.push(...items); },
    remove() { nodes = nodes.filter(node => node !== this); },
  });
  vi.stubGlobal('document', {
    createElement: element, head: element(), body: element(),
    getElementById: id => nodes.find(node => node.id === id),
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('mostra texto seguro por exatamente um segundo sem roubar foco', () => {
  showAppConfirmation('<img src=x onerror=alert(1)>');
  const toast = document.getElementById('app-confirmation');
  expect(toast.attributes.role).toBe('status');
  expect(toast.children[0].children[1].textContent).toBe('<img src=x onerror=alert(1)>');
  expect(document.getElementById('app-confirmation-style').textContent).toContain('position:fixed; inset:0');
  vi.advanceTimersByTime(999);
  expect(document.getElementById('app-confirmation')).toBe(toast);
  vi.advanceTimersByTime(1);
  expect(document.getElementById('app-confirmation')).toBeUndefined();
});

it('substitui a confirmação anterior e reinicia seu tempo', () => {
  showAppConfirmation('Primeira');
  vi.advanceTimersByTime(600);
  showAppConfirmation('Segunda');
  expect(nodes.filter(node => node.id === 'app-confirmation')).toHaveLength(1);
  vi.advanceTimersByTime(400);
  expect(document.getElementById('app-confirmation')).toBeDefined();
  vi.advanceTimersByTime(600);
  expect(document.getElementById('app-confirmation')).toBeUndefined();
});
