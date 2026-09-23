import { describe, expect, it } from 'vitest';
import { MockTreinoStore, LOCAL_MOCK_FIXED, LOCAL_MOCK_STORAGE_KEY } from '../../features/missoes_treino/mock.example.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

describe('MockTreinoStore (missoes_treino)', () => {
  it('exporta flag de mock local fixo', () => {
    expect(LOCAL_MOCK_FIXED).toBe(true);
  });

  it('lista perfis demo padrao', async () => {
    const store = new MockTreinoStore();
    const result = await store.handle('?resource=profiles');

    expect(result.profiles.length).toBeGreaterThanOrEqual(3);
    expect(result.profiles[0]).toMatchObject({
      nome: expect.any(String),
      missions_count: expect.any(Number),
    });
  });

  it('lista missoes filtradas por profile_id', async () => {
    const store = new MockTreinoStore();
    const result = await store.handle('?profile_id=demo-1');

    expect(result.profile_id).toBe('demo-1');
    expect(Array.isArray(result.missions)).toBe(true);
    expect(result.missions.length).toBeGreaterThan(0);
    expect(result.performance.radar.length).toBe(5);
  });

  it('cria perfil e missao em memoria', async () => {
    const store = new MockTreinoStore();

    const createdProfile = await store.handle('', {
      method: 'POST',
      body: JSON.stringify({
        resource: 'profile',
        nome: 'Teste API Mock',
        descricao: 'Perfil temporario',
      }),
    });

    const profileId = createdProfile.profile.id;
    const createdMission = await store.handle('', {
      method: 'POST',
      body: JSON.stringify({
        profile_id: profileId,
        title: 'Treino teste',
        items: [{ name: 'Flexoes [3x10]', reps: 30, series: 3, repeticoes: 10 }],
      }),
    });

    expect(createdMission.mission.title).toBe('Treino teste');

    const listed = await store.handle(`?profile_id=${profileId}`);
    expect(listed.missions.some((m) => m.title === 'Treino teste')).toBe(true);
  });

  it('cria e exclui logs sem bloquear um novo ciclo do mesmo treino', async () => {
    const store = new MockTreinoStore();
    const before = await store.handle('?profile_id=demo-1');
    const mission = before.missions[0];

    const created = await store.handle('', {
      method: 'POST',
      body: JSON.stringify({ resource: 'workout-log', mission_id: mission.id, duration_seconds: 125 }),
    });

    const second = await store.handle('', {
      method: 'POST',
      body: JSON.stringify({ resource: 'workout-log', mission_id: mission.id, duration_seconds: 240 }),
    });

    const logs = await store.handle('?resource=workout-logs&profile_id=demo-1');
    expect(logs.logs).toHaveLength(2);
    expect(logs.logs.map((log) => log.duration_seconds)).toEqual(expect.arrayContaining([125, 240]));
    expect(logs.logs.every((log) => log.workout_name === mission.title)).toBe(true);
    expect((await store.handle('?resource=workout-logs&profile_id=demo-2')).logs).toEqual([]);
    expect((await store.handle('?profile_id=demo-1')).missions.find((item) => item.id === mission.id)).toBeTruthy();

    await store.handle('', {
      method: 'DELETE',
      body: JSON.stringify({ resource: 'workout-log', id: created.log.id }),
    });
    const remaining = await store.handle('?resource=workout-logs&profile_id=demo-1');
    expect(remaining.logs).toHaveLength(1);
    expect(remaining.logs[0].id).toBe(second.log.id);
  });

  it('persiste perfis, treinos e logs no localStorage entre recargas', async () => {
    const storage = createMemoryStorage();
    const firstStore = new MockTreinoStore(storage);
    const createdProfile = await firstStore.handle('', {
      method: 'POST',
      body: JSON.stringify({ resource: 'profile', nome: 'Teste local', descricao: 'Persistente' }),
    });
    const createdMission = await firstStore.handle('', {
      method: 'POST',
      body: JSON.stringify({ profile_id: createdProfile.profile.id, title: 'Treino local', items: [{ name: 'Teste', reps: 5, series: 1, repeticoes: 5 }] }),
    });
    await firstStore.handle('', {
      method: 'POST',
      body: JSON.stringify({ resource: 'workout-log', mission_id: createdMission.mission.id, duration_seconds: 90 }),
    });

    expect(storage.getItem(LOCAL_MOCK_STORAGE_KEY)).toBeTruthy();
    const reloadedStore = new MockTreinoStore(storage);
    const profiles = await reloadedStore.handle('?resource=profiles');
    const missions = await reloadedStore.handle(`?profile_id=${createdProfile.profile.id}`);
    const logs = await reloadedStore.handle(`?resource=workout-logs&profile_id=${createdProfile.profile.id}`);

    expect(profiles.profiles.some((profile) => profile.nome === 'Teste local')).toBe(true);
    expect(missions.missions.some((mission) => mission.title === 'Treino local')).toBe(true);
    expect(logs.logs).toHaveLength(1);
    expect(logs.logs[0].duration_seconds).toBe(90);
  });
});
