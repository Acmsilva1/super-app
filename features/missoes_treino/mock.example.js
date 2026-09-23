// Mock padrão versionado — em localhost o módulo treino usa isto direto, sem ativar nada.
export const LOCAL_MOCK_FIXED = true;
export const LOCAL_MOCK_STORAGE_KEY = 'superapp:missoes-treino:mock:v1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const BASE_PROFILES = [
  {
    id: 'demo-1',
    nome: 'Hipertrofia',
    descricao: 'Treino focado em ganho de massa muscular',
    cor: '#00e5ff',
    icone: 'fa-dumbbell',
  },
  {
    id: 'demo-2',
    nome: 'Emagrecimento',
    descricao: 'Cardio, funcional e déficit calórico',
    cor: '#ff8a00',
    icone: 'fa-fire',
  },
  {
    id: 'demo-3',
    nome: 'Corrida 5K',
    descricao: 'Preparação para prova de 5 km',
    cor: '#00d084',
    icone: 'fa-person-running',
  },
];

const BASE_MISSIONS = {
  'demo-1': [
    {
      id: 'demo-m1',
      title: 'Treino de Segunda',
      data_referencia: '2026-08-11',
      completed: false,
      items: [
        { id: 'demo-i1', name: 'Supino reto [4x10]', reps: 40, series: 4, repeticoes: 10, completed: true, ordem: 1 },
        { id: 'demo-i2', name: 'Crucifixo [3x12]', reps: 36, series: 3, repeticoes: 12, completed: false, ordem: 2 },
        { id: 'demo-i3', name: 'Tríceps pulley [3x15]', reps: 45, series: 3, repeticoes: 15, completed: false, ordem: 3 },
      ],
    },
    {
      id: 'demo-m2',
      title: 'Treino de Quarta',
      data_referencia: '2026-08-13',
      completed: false,
      items: [
        { id: 'demo-i4', name: 'Agachamento [4x8]', reps: 32, series: 4, repeticoes: 8, completed: false, ordem: 1 },
        { id: 'demo-i5', name: 'Leg press [3x12]', reps: 36, series: 3, repeticoes: 12, completed: false, ordem: 2 },
      ],
    },
    {
      id: 'demo-m3',
      title: 'Treino de Sexta',
      data_referencia: '2026-08-15',
      completed: false,
      items: [
        { id: 'demo-i6', name: 'Remada curvada [4x10]', reps: 40, series: 4, repeticoes: 10, completed: false, ordem: 1 },
        { id: 'demo-i7', name: 'Barra fixa [3x8]', reps: 24, series: 3, repeticoes: 8, completed: false, ordem: 2 },
      ],
    },
  ],
  'demo-2': [
    {
      id: 'demo-m4',
      title: 'Treino de Terça',
      data_referencia: '2026-08-12',
      completed: false,
      items: [
        { id: 'demo-i8', name: 'Burpee [3x12]', reps: 36, series: 3, repeticoes: 12, completed: true, ordem: 1 },
        { id: 'demo-i9', name: 'Polichinelo [3x40]', reps: 120, series: 3, repeticoes: 40, completed: false, ordem: 2 },
      ],
    },
    {
      id: 'demo-m5',
      title: 'Treino de Quinta',
      data_referencia: '2026-08-14',
      completed: false,
      items: [
        { id: 'demo-i10', name: 'Esteira [1x20]', reps: 20, series: 1, repeticoes: 20, completed: false, ordem: 1 },
        { id: 'demo-i11', name: 'Abdominal [3x20]', reps: 60, series: 3, repeticoes: 20, completed: false, ordem: 2 },
      ],
    },
  ],
  'demo-3': [
    {
      id: 'demo-m6',
      title: 'Treino de Sábado',
      data_referencia: '2026-08-16',
      completed: false,
      items: [
        { id: 'demo-i12', name: 'Corrida leve [1x30]', reps: 30, series: 1, repeticoes: 30, completed: false, ordem: 1 },
        { id: 'demo-i13', name: 'Alongamento [1x10]', reps: 10, series: 1, repeticoes: 10, completed: false, ordem: 2 },
      ],
    },
  ],
};

function buildMockPerformance() {
  return {
    month_ref: '2026-08',
    created_missions: 30,
    completed_missions: 12,
    success_rate_percent: 40,
    history: [
      { month_ref: '2026-08', completed_days: 12, cycle_total_days: 30, success_rate_percent: 40, closed: false },
      { month_ref: '2026-07', completed_days: 22, cycle_total_days: 30, success_rate_percent: 73, closed: true },
    ],
    mission_goals_by_month: [
      {
        month_ref: '2026-08',
        total_goals: 6,
        completed_goals: 2,
        success_rate_percent: 33,
        goals: [],
      },
    ],
    radar: [
      { key: 'forca', label: 'Força', value: 120, score: 100 },
      { key: 'cardio', label: 'Cardio', value: 80, score: 67 },
      { key: 'core', label: 'Core', value: 45, score: 38 },
      { key: 'mobilidade', label: 'Mobilidade', value: 20, score: 17 },
      { key: 'resistencia', label: 'Resistência', value: 65, score: 54 },
    ],
  };
}


export class MockTreinoStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage || null;
    this.profiles = clone(BASE_PROFILES);
    this.missionsByProfile = clone(BASE_MISSIONS);
    this.nextProfileId = 100;
    this.nextMissionId = 1000;
    this.nextItemId = 5000;
    this.nextLogId = 1;
    this.workoutLogs = [];
    this.restore();
  }

  restore() {
    if (!this.storage) return;
    try {
      const saved = JSON.parse(this.storage.getItem(LOCAL_MOCK_STORAGE_KEY) || 'null');
      if (!saved || saved.version !== 1 || !Array.isArray(saved.profiles) || !saved.missionsByProfile) return;
      this.profiles = saved.profiles;
      this.missionsByProfile = saved.missionsByProfile;
      this.workoutLogs = Array.isArray(saved.workoutLogs) ? saved.workoutLogs : [];
      this.nextProfileId = Number(saved.nextProfileId) || 100;
      this.nextMissionId = Number(saved.nextMissionId) || 1000;
      this.nextItemId = Number(saved.nextItemId) || 5000;
      this.nextLogId = Number(saved.nextLogId) || 1;
    } catch (_err) {
      // Estado local invalido volta ao mock inicial sem impedir a abertura do modulo.
    }
  }

  persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(LOCAL_MOCK_STORAGE_KEY, JSON.stringify({
        version: 1,
        profiles: this.profiles,
        missionsByProfile: this.missionsByProfile,
        workoutLogs: this.workoutLogs,
        nextProfileId: this.nextProfileId,
        nextMissionId: this.nextMissionId,
        nextItemId: this.nextItemId,
        nextLogId: this.nextLogId,
      }));
    } catch (_err) {
      // Falha de quota/privacidade mantem o mock funcional somente nesta sessao.
    }
  }

  countMissions(profileId) {
    return (this.missionsByProfile[String(profileId)] || []).length;
  }

  listProfiles() {
    return this.profiles.map((profile) => ({
      ...profile,
      missions_count: this.countMissions(profile.id),
    }));
  }

  listMissions(profileId) {
    return clone(this.missionsByProfile[String(profileId)] || []);
  }

  parseQuery(path = '') {
    const raw = String(path || '').replace(/^\?/, '');
    return new URLSearchParams(raw);
  }

  parseBody(options = {}) {
    if (!options.body) return {};
    if (typeof options.body === 'string') {
      try {
        return JSON.parse(options.body || '{}');
      } catch (_err) {
        return {};
      }
    }
    return options.body;
  }

  async handle(path = '', options = {}) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    const query = this.parseQuery(path);
    const method = String(options.method || 'GET').toUpperCase();
    const body = this.parseBody(options);

    if (method === 'GET' && query.get('resource') === 'profiles') {
      return { profiles: this.listProfiles() };
    }

    if (method === 'GET' && query.get('resource') === 'workout-logs') {
      const profileId = String(query.get('profile_id') || '');
      return { logs: clone(this.workoutLogs.filter((item) => String(item.profile_id) === profileId)), profile_id: profileId };
    }

    if (method === 'GET') {
      const profileId = String(query.get('profile_id') || '');
      if (!profileId) throw new Error('profile_id obrigatório para carregar treinos');
      return {
        date: '2026-08-12',
        profile_id: profileId,
        missions: this.listMissions(profileId),
        penalty: { required: false },
        performance: buildMockPerformance(),
        rest_day: false,
      };
    }

    if (method === 'POST' && body.resource === 'profile') {
      const profile = {
        id: `demo-${this.nextProfileId += 1}`,
        nome: String(body.nome || 'Novo perfil').trim(),
        descricao: String(body.descricao || '').trim(),
        cor: String(body.cor || '#00e5ff'),
        icone: String(body.icone || '🏋️'),
      };
      this.profiles.push(profile);
      this.missionsByProfile[profile.id] = [];
      this.persist();
      return { profile: { ...profile, missions_count: 0 } };
    }

    if (method === 'POST' && body.resource === 'workout-log') {
      const profileId = this.findProfileIdByMission(body.mission_id);
      const mission = (this.missionsByProfile[profileId] || [])
        .find((item) => String(item.id) === String(body.mission_id));
      if (!mission) throw new Error('Missão não encontrada');
      const duration = Number.parseInt(String(body.duration_seconds || ''), 10);
      if (!Number.isFinite(duration) || duration < 1) throw new Error('Duração inválida');
      const log = {
        id: `demo-log-${this.nextLogId += 1}`,
        profile_id: profileId,
        mission_id: mission.id,
        workout_name: mission.title,
        duration_seconds: duration,
        finished_at: new Date().toISOString(),
      };
      this.workoutLogs.unshift(log);
      this.persist();
      return { log: clone(log) };
    }

    if (method === 'POST') {
      const profileId = String(body.profile_id || '');
      if (!profileId) throw new Error('profile_id obrigatório para criar missão');
      const items = Array.isArray(body.items) ? body.items : [];
      const mission = {
        id: `demo-m${this.nextMissionId += 1}`,
        title: String(body.title || 'Novo treino').trim() || 'Novo treino',
        data_referencia: '2026-08-12',
        completed: false,
        items: items.map((item, idx) => ({
          id: `demo-i${this.nextItemId += 1}`,
          name: String(item.name || item.nome || 'Exercício'),
          reps: Number(item.reps || 0),
          series: Number(item.series || 1),
          repeticoes: Number(item.repeticoes || item.reps || 1),
          completed: Boolean(item.completed),
          ordem: idx + 1,
        })),
      };
      if (!this.missionsByProfile[profileId]) this.missionsByProfile[profileId] = [];
      this.missionsByProfile[profileId].push(mission);
      this.persist();
      return { mission, profile_id: profileId, date: '2026-08-12' };
    }

    if (method === 'PATCH' && body.resource === 'profile') {
      const profileId = String(body.profile_id || '');
      const profile = this.profiles.find((item) => String(item.id) === profileId);
      if (!profile) throw new Error('Perfil não encontrado');
      if (body.nome != null) profile.nome = String(body.nome || '').trim() || profile.nome;
      if (body.descricao != null) profile.descricao = String(body.descricao || '').trim();
      if (body.cor != null) profile.cor = String(body.cor || profile.cor);
      if (body.icone != null) profile.icone = String(body.icone || profile.icone);
      this.persist();
      return { profile: { ...profile, missions_count: this.countMissions(profile.id) } };
    }

    if (method === 'PATCH' && body.mission_id && body.completed === true) {
      const profileId = this.findProfileIdByMission(body.mission_id);
      const mission = (this.missionsByProfile[profileId] || [])
        .find((item) => String(item.id) === String(body.mission_id));
      if (!mission) throw new Error('Missão não encontrada');
      mission.items = (mission.items || []).map((item) => ({ ...item, completed: true }));
      mission.completed = true;
      this.persist();
      return { ok: true };
    }

    if (method === 'PATCH' && body.mission_id && Array.isArray(body.replace_items)) {
      const profileId = String(body.profile_id || this.findProfileIdByMission(body.mission_id) || '');
      const missions = this.missionsByProfile[profileId] || [];
      const mission = missions.find((item) => String(item.id) === String(body.mission_id));
      if (!mission) throw new Error('Missão não encontrada');
      mission.title = String(body.title || mission.title || 'Novo treino').trim() || mission.title;
      mission.items = body.replace_items.map((item, idx) => ({
        id: `demo-i${this.nextItemId += 1}`,
        name: String(item.name || item.nome || 'Exercício'),
        reps: Number(item.reps || 0),
        series: Number(item.series || 1),
        repeticoes: Number(item.repeticoes || item.reps || 1),
        completed: Boolean(item.completed),
        ordem: idx + 1,
      }));
      this.persist();
      return { ok: true };
    }

    if (method === 'DELETE' && body.resource === 'profile') {
      const profileId = String(body.profile_id || '');
      this.profiles = this.profiles.filter((item) => String(item.id) !== profileId);
      delete this.missionsByProfile[profileId];
      this.workoutLogs = this.workoutLogs.filter((item) => String(item.profile_id) !== profileId);
      this.persist();
      return { ok: true, profile_id: profileId };
    }

    if (method === 'DELETE' && body.resource === 'workout-log') {
      this.workoutLogs = this.workoutLogs.filter((item) => String(item.id) !== String(body.id));
      this.persist();
      return { ok: true, id: body.id };
    }

    if (method === 'DELETE' && body.mission_id) {
      const profileId = this.findProfileIdByMission(body.mission_id);
      if (!profileId) return { ok: true };
      this.missionsByProfile[profileId] = (this.missionsByProfile[profileId] || [])
        .filter((item) => String(item.id) !== String(body.mission_id));
      this.workoutLogs = this.workoutLogs.map((item) => (
        String(item.mission_id) === String(body.mission_id) ? { ...item, mission_id: null } : item
      ));
      this.persist();
      return { ok: true, mission_id: body.mission_id };
    }

    throw new Error('Operação mock não suportada');
  }

  findProfileIdByMission(missionId) {
    for (const [profileId, missions] of Object.entries(this.missionsByProfile)) {
      if ((missions || []).some((mission) => String(mission.id) === String(missionId))) return profileId;
    }
    return null;
  }
}
