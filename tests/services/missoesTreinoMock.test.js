import { describe, expect, it } from 'vitest';
import { MockTreinoStore, LOCAL_MOCK_FIXED } from '../../features/missoes_treino/mock.example.js';

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
});
