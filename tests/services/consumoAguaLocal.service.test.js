import { describe, expect, it } from 'vitest';
import {
  WATER_LOCAL_STORAGE_KEY,
  createLocalWaterProfile,
  deleteLocalWaterProfile,
  isLocalWaterStorageMode,
  loadLocalWater,
  saveLocalWaterGoal,
  updateLocalWaterProgress,
  updateLocalWaterProfile,
} from '../../features/saude/service/consumoAguaLocalService.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe('consumo de agua no localStorage', () => {
  it('e ativado somente em enderecos locais', () => {
    expect(isLocalWaterStorageMode({ hostname: 'localhost', protocol: 'http:' })).toBe(true);
    expect(isLocalWaterStorageMode({ hostname: '127.0.0.1', protocol: 'http:' })).toBe(true);
    expect(isLocalWaterStorageMode({ hostname: 'app.exemplo.com', protocol: 'https:' })).toBe(false);
  });

  it('cria meta, persiste checks e move o dia anterior para o historico', () => {
    const storage = createStorage();
    const firstDay = new Date('2026-09-23T15:00:00Z');
    const secondDay = new Date('2026-09-24T15:00:00Z');

    const created = saveLocalWaterGoal({ nome: 'Garrafa 500 ml', meta_doses: 10 }, storage, firstDay);
    expect(created.today).toMatchObject({ data: '2026-09-23', meta_doses: 10, realizado_doses: 0 });
    const checked = updateLocalWaterProgress({ realizado_doses: 4 }, storage, firstDay);
    expect(checked.today.realizado_doses).toBe(4);
    expect(storage.getItem(WATER_LOCAL_STORAGE_KEY)).toBeTruthy();

    const reloaded = loadLocalWater(storage, firstDay);
    expect(reloaded.today.realizado_doses).toBe(4);
    const nextDay = loadLocalWater(storage, secondDay);
    expect(nextDay.today).toMatchObject({ data: '2026-09-24', realizado_doses: 0 });
    expect(nextDay.history[0]).toMatchObject({ data: '2026-09-23', meta_doses: 10, realizado_doses: 4 });
  });

  it('rejeita progresso acima da meta local', () => {
    const storage = createStorage();
    const now = new Date('2026-09-23T15:00:00Z');
    saveLocalWaterGoal({ nome: 'Copo', meta_doses: 2 }, storage, now);
    expect(() => updateLocalWaterProgress({ realizado_doses: 3 }, storage, now)).toThrow('entre zero e a meta');
  });

  it('separa metas, checks e historicos por perfil', () => {
    const storage = createStorage();
    const now = new Date('2026-09-23T15:00:00Z');
    const andre = createLocalWaterProfile({ nome: 'André' }, storage, now);
    saveLocalWaterGoal({ profile_id: andre.profile_id, nome: 'Garrafa', meta_doses: 4 }, storage, now);
    updateLocalWaterProgress({ profile_id: andre.profile_id, realizado_doses: 3 }, storage, now);

    const juliana = createLocalWaterProfile({ nome: 'Juliana' }, storage, now);
    saveLocalWaterGoal({ profile_id: juliana.profile_id, nome: 'Copo', meta_doses: 6 }, storage, now);

    expect(loadLocalWater(storage, now, andre.profile_id).today.realizado_doses).toBe(3);
    expect(loadLocalWater(storage, now, juliana.profile_id).today.realizado_doses).toBe(0);
    expect(juliana.profiles.map((profile) => profile.nome)).toEqual(['André', 'Juliana']);

    const renamed = updateLocalWaterProfile({ profile_id: andre.profile_id, nome: 'André Silva' }, storage, now);
    expect(renamed.profiles.find((profile) => profile.id === andre.profile_id)?.nome).toBe('André Silva');

    const afterDelete = deleteLocalWaterProfile({ profile_id: andre.profile_id }, storage, now);
    expect(afterDelete.profiles.map((profile) => profile.nome)).toEqual(['Juliana']);
    expect(afterDelete.profile_id).toBe(juliana.profile_id);
  });
});
