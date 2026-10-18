import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const shell = html.slice(html.indexOf('class SuperApp'));
function method(name) {
  const start = shell.search(new RegExp(`^            (?:async )?${name}\\(`, 'm'));
  const rest = shell.slice(start);
  const end = rest.slice(1).search(/^            (?:async )?\w+\(/m) + 1;
  return new Function(`return ({${rest.slice(0, end)}})` )()[name];
}
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

it('libera a abertura após os apps mesmo com todas as cargas secundárias pendentes', async () => {
  const apps = deferred(), secondary = deferred();
  vi.stubGlobal('history', {});
  vi.stubGlobal('SuperAppAuth', { init: async () => true });
  const app = {
    loadData: method('loadData'), loadBackgroundData: method('loadBackgroundData'),
    loadApps: () => apps.promise, loadStatistics: () => secondary.promise,
    loadRoadmap: () => secondary.promise, setupAdminUsers: () => secondary.promise,
    setupEventListeners() {}, updateStatistics: vi.fn(), startNotificationCenter() {},
    restoreFinanceiroOperations() {}, loadAppVersionManifest: async () => {},
    ensureHomeVersionBadge() {}, dismissLaunchSplash: vi.fn(),
  };
  const opening = method('init').call(app);
  await Promise.resolve();
  expect(app.dismissLaunchSplash).not.toHaveBeenCalled();
  apps.resolve();
  await opening;
  expect(app.dismissLaunchSplash).toHaveBeenCalledOnce();
  expect(app.updateStatistics).toHaveBeenCalledOnce();
  secondary.resolve();
  await app.backgroundDataPromise;
  expect(app.updateStatistics).toHaveBeenCalledTimes(2);
});

it('trata falhas secundárias sem rejeição não capturada', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const updateStatistics = vi.fn();
  await expect(method('loadBackgroundData').call({
    loadStatistics: async () => { throw Error('estatísticas indisponíveis'); },
    loadRoadmap: () => { throw Error('roadmap indisponível'); },
    setupAdminUsers: async () => {}, updateStatistics,
  })).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(2);
  expect(updateStatistics).not.toHaveBeenCalled();
});

it('libera a splash imediatamente e só aguarda a transição para remover o elemento', () => {
  vi.useFakeTimers();
  const splash = { dataset: {}, querySelector: () => ({}), classList: { add: vi.fn() }, remove: vi.fn() };
  vi.stubGlobal('document', { getElementById: () => splash });
  vi.stubGlobal('window', { setTimeout });
  method('dismissLaunchSplash').call({});
  expect(splash.classList.add).toHaveBeenCalledWith('is-complete', 'is-ready');
  expect(splash.remove).not.toHaveBeenCalled();
  vi.advanceTimersByTime(360);
  expect(splash.remove).toHaveBeenCalledOnce();
});
