import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HOME_DIET_LAST_DIET_KEY,
  HOME_DIET_LAST_PROFILE_KEY,
  readHomeDietLastDietId,
  readHomeDietLastProfileId,
  resolveHomeDietInitialDietId,
  resolveHomeDietInitialProfileId,
  writeHomeDietLastDietId,
  writeHomeDietLastProfileId,
} from '../../features/saude/homeDietQuick.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

describe('atalho de Dietas na tela inicial', () => {
  it('posiciona o botão acima da gota e conecta o clique ao modal rápido', () => {
    expect(indexSource.indexOf('id="homeDietFab"')).toBeLessThan(indexSource.indexOf('id="homeWaterFab"'));
    expect(indexSource).toContain('.home-diet-fab');
    expect(indexSource).toContain("this.quickOpenDiet(e)");
    expect(indexSource).toMatch(/import\('\.\/features\/saude\/homeDietQuick\.js\?v=[^']+'\)/);
  });

  it('direciona os detalhes de Dieta e Água para a tela do perfil selecionado', () => {
    const dietSource = fs.readFileSync(path.join(root, 'features/saude/homeDietQuick.js'), 'utf8');
    const waterSource = fs.readFileSync(path.join(root, 'features/saude/homeWaterQuick.js'), 'utf8');
    expect(dietSource).toContain("{ profileId: state.profileId, screen: 'hub' }");
    expect(waterSource).toContain("{ profileId: state.profileId, screen: 'hub' }");
    expect(indexSource).toContain('launchSaude: (intent) => this.openSaudeAt(intent)');
    expect(indexSource).toContain("view: 'profile-detail',");
    expect(indexSource).toContain("profileScreen: intent.screen || 'hub'");
  });

  it('persiste e reutiliza somente um perfil ainda válido', () => {
    const storage = memoryStorage();
    writeHomeDietLastProfileId(22, storage);
    expect(storage.getItem(HOME_DIET_LAST_PROFILE_KEY)).toBe('22');
    expect(readHomeDietLastProfileId(storage)).toBe(22);
    expect(resolveHomeDietInitialProfileId([{ id: 11 }, { id: 22 }], storage)).toBe(22);
    expect(resolveHomeDietInitialProfileId([{ id: 11 }], storage)).toBe(11);
  });

  it('não grava ids inválidos no localStorage', () => {
    const storage = memoryStorage();
    writeHomeDietLastProfileId('perfil-invalido', storage);
    expect(storage.getItem(HOME_DIET_LAST_PROFILE_KEY)).toBeNull();
  });

  it('persiste a última dieta e só a restaura quando ela ainda existe', () => {
    const storage = memoryStorage();
    writeHomeDietLastDietId(205, storage);
    expect(storage.getItem(HOME_DIET_LAST_DIET_KEY)).toBe('205');
    expect(readHomeDietLastDietId(storage)).toBe(205);
    expect(resolveHomeDietInitialDietId([{ id: 204 }, { id: 205 }], storage)).toBe(205);
    expect(resolveHomeDietInitialDietId([{ id: 204 }], storage)).toBeNull();
  });

  it('abre automaticamente a dieta salva depois de recuperar o perfil', () => {
    const source = fs.readFileSync(path.join(root, 'features/saude/homeDietQuick.js'), 'utf8');
    expect(source).toContain('await openProfile(state.profileId, { preferredDietId: lastDietId })');
    expect(source).toContain('writeHomeDietLastDietId(state.dietId)');
  });
});
