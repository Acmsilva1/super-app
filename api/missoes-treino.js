import { supabase } from '../lib/supabase.js';
import { requireUser } from '../lib/auth.js';

const TABLE_MISSOES = 'tb_missoes_treino';
const TABLE_ITENS = 'tb_missoes_treino_itens';
const TABLE_CHAMAS = 'tb_missoes_treino_chamas';
const TABLE_PERFIS = 'tb_missoes_treino_perfis';

function normalizeProfileId(value) {
  const n = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isMissingProfilesTableError(message) {
  const lower = String(message || '').toLowerCase();
  return (
    lower.includes('tb_missoes_treino_perfis') &&
    (lower.includes('does not exist') || lower.includes('schema cache') || lower.includes('relation'))
  );
}

function mapProfileRow(row) {
  return {
    id: row.id,
    nome: row.nome || 'Perfil',
    descricao: row.descricao || '',
    cor: row.cor || '#00e5ff',
    icone: row.icone || 'fa-dumbbell',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    missions_count: Number(row.missions_count || 0),
  };
}

async function countMissionsByProfileIds(profileIds = []) {
  const counts = new Map();
  for (const id of profileIds) counts.set(id, 0);
  if (!profileIds.length) return counts;

  const { data, error } = await supabase
    .from(TABLE_MISSOES)
    .select('perfil_id')
    .in('perfil_id', profileIds);
  if (error) {
    if (isMissingProfilesTableError(error.message)) return counts;
    throw new Error(error.message);
  }
  for (const row of data || []) {
    const pid = Number(row?.perfil_id);
    if (!counts.has(pid)) continue;
    counts.set(pid, (counts.get(pid) || 0) + 1);
  }
  return counts;
}

async function adoptOrphanMissions(profileId) {
  if (!profileId) return 0;

  const { data, error } = await supabase
    .from(TABLE_MISSOES)
    .select('id')
    .is('perfil_id', null)
    .limit(2000);
  if (error) {
    if (isMissingProfilesTableError(error.message)) return 0;
    throw new Error(error.message);
  }
  if (!Array.isArray(data) || !data.length) return 0;

  const { error: updErr } = await supabase
    .from(TABLE_MISSOES)
    .update({ perfil_id: profileId })
    .is('perfil_id', null);
  if (updErr) {
    if (isMissingProfilesTableError(updErr.message)) return 0;
    throw new Error(updErr.message);
  }
  return data.length;
}

async function ensureDefaultProfileRows() {
  const { data, error } = await supabase
    .from(TABLE_PERFIS)
    .select('id,nome,descricao,cor,icone,created_at,updated_at')
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingProfilesTableError(error.message)) return [];
    throw new Error(error.message);
  }

  let rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    const { data: created, error: createErr } = await supabase
      .from(TABLE_PERFIS)
      .insert({
        nome: 'Oficial',
        descricao: 'Perfil principal — treinos salvos antes da divisão por perfil',
        cor: '#00e5ff',
        icone: 'fa-dumbbell',
      })
      .select('id,nome,descricao,cor,icone,created_at,updated_at')
      .single();
    if (createErr) throw new Error(createErr.message);
    if (created) rows = [created];
  }

  const targetId = rows[0]?.id;
  if (targetId) await adoptOrphanMissions(targetId);
  return rows;
}

async function fetchProfiles() {
  const data = await ensureDefaultProfileRows();
  const profileIds = (data || []).map((row) => row.id).filter(Boolean);
  const counts = await countMissionsByProfileIds(profileIds);
  return (data || []).map((row) => mapProfileRow({ ...row, missions_count: counts.get(row.id) || 0 }));
}

async function createProfile(body = {}) {
  const nome = normalizeNome(body.nome);
  if (!nome) throw new Error('nome do perfil é obrigatório');

  const payload = {
    nome,
    descricao: String(body.descricao || '').trim().slice(0, 240),
    cor: String(body.cor || '#00e5ff').trim().slice(0, 24) || '#00e5ff',
    icone: String(body.icone || 'fa-dumbbell').trim().slice(0, 48) || 'fa-dumbbell',
  };

  const { data, error } = await supabase.from(TABLE_PERFIS).insert(payload).select('*').single();
  if (error) throw new Error(error.message);
  return mapProfileRow({ ...data, missions_count: 0 });
}

async function updateProfile(profileId, body = {}) {
  const payload = {};
  if (body.nome != null) {
    const nome = normalizeNome(body.nome);
    if (!nome) throw new Error('nome do perfil inválido');
    payload.nome = nome;
  }
  if (body.descricao != null) payload.descricao = String(body.descricao || '').trim().slice(0, 240);
  if (body.cor != null) payload.cor = String(body.cor || '#00e5ff').trim().slice(0, 24) || '#00e5ff';
  if (body.icone != null) payload.icone = String(body.icone || 'fa-dumbbell').trim().slice(0, 48) || 'fa-dumbbell';
  if (!Object.keys(payload).length) throw new Error('nada para atualizar no perfil');

  const { data, error } = await supabase
    .from(TABLE_PERFIS)
    .update(payload)
    .eq('id', profileId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  const counts = await countMissionsByProfileIds([profileId]);
  return mapProfileRow({ ...data, missions_count: counts.get(profileId) || 0 });
}

async function deleteProfile(profileId) {
  const { error } = await supabase.from(TABLE_PERFIS).delete().eq('id', profileId);
  if (error) throw new Error(error.message);
  return { ok: true, profile_id: profileId };
}

function applyProfileFilter(query, perfilId) {
  if (!perfilId) return query;
  return query.eq('perfil_id', perfilId);
}

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch (_err) {
      return {};
    }
  }
  return req.body;
}

function getTzDateParts(timeZone, dateObj = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(dateObj);
  const map = {};
  for (const part of parts) {
    if (part?.type === 'year' || part?.type === 'month' || part?.type === 'day') {
      map[part.type] = String(part.value || '').padStart(2, '0');
    }
  }
  const year = String(map.year || '');
  const month = String(map.month || '');
  const day = String(map.day || '');
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    throw new Error('Falha ao obter data no fuso configurado');
  }
  return { year, month, day, isoDate: `${year}-${month}-${day}` };
}

function getTodayBrazilIsoDate() {
  return getTzDateParts('America/Sao_Paulo').isoDate;
}

function getMonthRangeFromDateRef(dateRef) {
  const [year, month] = String(dateRef).split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const monthRef = `${year}-${String(month).padStart(2, '0')}`;
  return { start, end, monthRef };
}

function listRecentMonthRefs(anchorMonthRef, floorMonthRef = null) {
  const [year, month] = String(anchorMonthRef || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];
  const floor = String(floorMonthRef || '').trim();
  const refs = [];
  let cursor = new Date(year, month - 1, 1);
  while (true) {
    const d = new Date(cursor);
    const monthRef = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (floor && monthRef < floor) break;
    refs.push(monthRef);
    cursor.setMonth(cursor.getMonth() - 1);
  }
  return refs;
}

async function getHistoryFloorMonthRef(anchorMonthRef, perfilId = null) {
  let query = supabase
    .from(TABLE_MISSOES)
    .select('data_referencia')
    .order('data_referencia', { ascending: true })
    .limit(1);
  if (perfilId) query = query.eq('perfil_id', perfilId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const firstDate = String(data?.[0]?.data_referencia || '');
  const firstMonth = /^\d{4}-\d{2}-\d{2}$/.test(firstDate) ? firstDate.slice(0, 7) : '';
  return firstMonth || String(anchorMonthRef || '');
}

async function fetchMonthlyHistory(anchorMonthRef, cycleTotalDays = 30, perfilId = null) {
  const floorMonthRef = await getHistoryFloorMonthRef(anchorMonthRef, perfilId);
  const months = listRecentMonthRefs(anchorMonthRef, floorMonthRef);
  if (!months.length) return [];

  const doneByMonth = new Map(months.map((monthRef) => [monthRef, new Set()]));
  const { data: chamasRows, error: cErr } = await supabase
    .from(TABLE_CHAMAS)
    .select('mes_ref,dia,concluida')
    .in('mes_ref', months)
    .eq('concluida', true);

  if (cErr) {
    if (!isMissingChamasTableError(cErr.message)) throw new Error(cErr.message);
    return months.map((monthRef, idx) => ({
      month_ref: monthRef,
      completed_days: 0,
      cycle_total_days: cycleTotalDays,
      success_rate_percent: 0,
      closed: idx !== 0,
    }));
  }

  for (const row of chamasRows || []) {
    const monthRef = String(row?.mes_ref || '');
    if (!doneByMonth.has(monthRef)) continue;
    const day = Number(row?.dia);
    if (day < 1 || day > cycleTotalDays) continue;
    doneByMonth.get(monthRef).add(day);
  }

  return months.map((monthRef, idx) => {
    const completedDays = doneByMonth.get(monthRef)?.size || 0;
    return {
      month_ref: monthRef,
      completed_days: completedDays,
      cycle_total_days: cycleTotalDays,
      success_rate_percent: Math.round((completedDays / cycleTotalDays) * 100),
      closed: idx !== 0,
    };
  });
}

function getBrazilDatePartsFrom(dateObj) {
  const { year, month, day: dayStr, isoDate } = getTzDateParts('America/Sao_Paulo', dateObj);
  const monthRef = `${year}-${month}`;
  const day = Number(dayStr || 1);
  return { isoDate, monthRef, day };
}

function getBrazilDateParts() {
  return getBrazilDatePartsFrom(new Date());
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function getWeekdayMonToSunFromIso(isoDate) {
  if (!isIsoDate(isoDate)) return null;
  const d = new Date(`${isoDate}T12:00:00-03:00`);
  const jsDay = d.getDay(); // 0..6 (Sun..Sat)
  return jsDay === 0 ? 7 : jsDay; // 1..7 (Mon..Sun)
}

function isTrainingWeekday(weekdayMonToSun) {
  return Number.isFinite(weekdayMonToSun) && weekdayMonToSun >= 1 && weekdayMonToSun <= 6;
}

function normalizeWeekdayText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getWeekdayTokensFromIsoDate(isoDate) {
  const wd = getWeekdayMonToSunFromIso(isoDate);
  const map = {
    1: ['segunda', 'segunda-feira', 'seg'],
    2: ['terca', 'terca-feira', 'ter', 'terça', 'terça-feira'],
    3: ['quarta', 'quarta-feira', 'qua'],
    4: ['quinta', 'quinta-feira', 'qui'],
    5: ['sexta', 'sexta-feira', 'sex'],
    6: ['sabado', 'sabado-feira', 'sab', 'sábado'],
  };
  return map[wd] || [];
}

function missionMatchesWeekdayByTitle(mission, dateRef) {
  const tokens = getWeekdayTokensFromIsoDate(dateRef);
  if (!tokens.length) return false;
  const ref = normalizeWeekdayText(`${mission?.titulo || ''} ${mission?.title || ''} ${mission?.data_referencia || ''}`);
  if (!ref) return false;
  return tokens.some((t) => ref.includes(normalizeWeekdayText(t)));
}

function getWeekdayIndexFromText(value) {
  const txt = normalizeWeekdayText(value);
  if (!txt) return 0;
  if (/(^|[^a-z])segunda(-feira)?([^a-z]|$)|(^|[^a-z])seg([^a-z]|$)/.test(txt)) return 1;
  if (/(^|[^a-z])terca(-feira)?([^a-z]|$)/.test(txt)) return 2;
  if (/(^|[^a-z])quarta(-feira)?([^a-z]|$)|(^|[^a-z])qua([^a-z]|$)/.test(txt)) return 3;
  if (/(^|[^a-z])quinta(-feira)?([^a-z]|$)|(^|[^a-z])qui([^a-z]|$)/.test(txt)) return 4;
  if (/(^|[^a-z])sexta(-feira)?([^a-z]|$)|(^|[^a-z])sex([^a-z]|$)/.test(txt)) return 5;
  if (/(^|[^a-z])sabado(-feira)?([^a-z]|$)|(^|[^a-z])sab([^a-z]|$)/.test(txt)) return 6;
  return 0;
}

function addDaysToIsoDate(isoDate, days) {
  const base = new Date(`${isoDate}T12:00:00-03:00`);
  base.setDate(base.getDate() + Number(days || 0));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMondayOfWeek(isoDate) {
  const wd = getWeekdayMonToSunFromIso(isoDate);
  if (!wd) return isoDate;
  return addDaysToIsoDate(isoDate, -(wd - 1));
}

function buildWeekDatesFromMonday(mondayIso) {
  return [1, 2, 3, 4, 5, 6].map((idx) => ({
    weekday: idx,
    dateRef: addDaysToIsoDate(mondayIso, idx - 1),
  }));
}

function normalizeNome(value) {
  return String(value ?? '').trim().slice(0, 120);
}

function normalizeReps(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, idx) => ({
      nome: normalizeNome(item?.name ?? item?.nome),
      reps: normalizeReps(item?.reps),
      ordem: Number.isFinite(Number(item?.ordem)) ? Number(item.ordem) : idx + 1,
      concluida: Boolean(item?.completed ?? item?.concluida ?? false),
    }))
    .filter((item) => item.nome && item.reps);
}

function normalizeRadarText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inferRadarDistribution(name) {
  const n = normalizeRadarText(name);
  const profiles = [
    {
      terms: ['corrida', 'bike', 'esteira', 'caminhada', 'corda', 'spinning', 'polichinelo', 'hiit'],
      weights: { cardio: 0.7, resistencia: 0.2, core: 0.1 },
    },
    {
      terms: ['burpee', 'mountain climber', 'circuito', 'tabata'],
      weights: { cardio: 0.45, resistencia: 0.35, forca: 0.15, core: 0.05 },
    },
    {
      terms: ['agachamento', 'supino', 'remada', 'levantamento', 'terra', 'barra fixa', 'afundo', 'forca'],
      weights: { forca: 0.65, resistencia: 0.2, core: 0.1, mobilidade: 0.05 },
    },
    {
      terms: ['flexao', 'triceps', 'ombro', 'peito', 'biceps', 'panturrilha'],
      weights: { forca: 0.55, resistencia: 0.25, core: 0.15, mobilidade: 0.05 },
    },
    {
      terms: ['abdominal', 'prancha', 'core', 'lombar', 'hollow', 'canivete'],
      weights: { core: 0.7, resistencia: 0.15, forca: 0.1, mobilidade: 0.05 },
    },
    {
      terms: ['alongamento', 'mobilidade', 'yoga', 'flexibilidade', 'pilates'],
      weights: { mobilidade: 0.75, core: 0.15, resistencia: 0.1 },
    },
    {
      terms: ['isometria', 'wall sit', 'prancha estatica', 'resistencia'],
      weights: { resistencia: 0.6, core: 0.2, forca: 0.2 },
    },
  ];

  for (const profile of profiles) {
    if (profile.terms.some((term) => n.includes(term))) return profile.weights;
  }

  return { forca: 0.45, resistencia: 0.25, core: 0.15, cardio: 0.1, mobilidade: 0.05 };
}

function isMissingChamasTableError(message) {
  const lower = String(message || '').toLowerCase();
  return (
    lower.includes('tb_missoes_treino_chamas') &&
    (lower.includes('does not exist') || lower.includes('schema cache') || lower.includes('relation') || lower.includes('mission_id'))
  );
}

function groupMissions(missionRows, itemRows) {
  const grouped = new Map();
  for (const mission of missionRows || []) {
    grouped.set(mission.id, {
      id: mission.id,
      title: mission.titulo || 'Novo treino',
      data_referencia: mission.data_referencia,
      created_at: mission.created_at || null,
      items: [],
      completed: false,
    });
  }

  for (const row of itemRows || []) {
    const target = grouped.get(row.missao_id);
    if (!target) continue;
    target.items.push({
      id: row.id,
      mission_id: row.missao_id,
      name: row.nome || '',
      reps: Number(row.reps || 0),
      completed: Boolean(row.concluida),
      ordem: Number(row.ordem || 0),
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    });
  }

  const missions = Array.from(grouped.values()).map((mission) => {
    mission.items.sort((a, b) => a.ordem - b.ordem || String(a.created_at || '').localeCompare(String(b.created_at || '')));
    const total = mission.items.length;
    const done = mission.items.filter((item) => item.completed).length;
    mission.completed = total > 0 && done === total;
    mission.items_total = total;
    mission.items_completed = done;
    return mission;
  });

  missions.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  return missions;
}

async function autoCarryOverLatestMission(dateRef, perfilId = null) {
  const targetWeekday = getWeekdayMonToSunFromIso(dateRef);
  if (!isTrainingWeekday(targetWeekday)) return false;
  if (!perfilId) return false;

  let previousQuery = supabase
    .from(TABLE_MISSOES)
    .select('id,titulo,data_referencia,created_at,origem,perfil_id')
    .eq('perfil_id', perfilId)
    .lt('data_referencia', dateRef)
    .order('created_at', { ascending: false })
    .limit(500);
  const { data: previousMissions, error: mErr } = await previousQuery;
  if (mErr) throw new Error(mErr.message);

  let oldMissions = (previousMissions || []).filter((m) => missionMatchesWeekdayByTitle(m, dateRef));
  if (!oldMissions.length) return false;

  const { data: todayMissions, error: tErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id,titulo')
    .eq('data_referencia', dateRef)
    .eq('perfil_id', perfilId);
  if (tErr) throw new Error(tErr.message);
  const todayTitles = new Set((todayMissions || []).map((m) => normalizeWeekdayText(m?.titulo || '')));
  oldMissions = oldMissions.filter((m) => !todayTitles.has(normalizeWeekdayText(m?.titulo || '')));
  if (!oldMissions.length) return false;

  const oldMissionIds = oldMissions.map((m) => m.id);

  const { data: oldItems, error: oiErr } = await supabase
    .from(TABLE_ITENS)
    .select('*')
    .in('missao_id', oldMissionIds)
    .order('ordem', { ascending: true });
  
  if (oiErr) throw new Error(oiErr.message);

  for (const oldM of oldMissions) {
    const { data: newM, error: newMErr } = await supabase
      .from(TABLE_MISSOES)
      .insert({ data_referencia: dateRef, titulo: oldM.titulo, origem: oldM.origem, perfil_id: perfilId })
      .select('id')
      .single();
    if (newMErr) continue;

    const itemsForMissao = oldItems.filter(i => i.missao_id === oldM.id);
    if (itemsForMissao.length > 0) {
      const itemsPayload = itemsForMissao.map(item => ({
        missao_id: newM.id,
        nome: item.nome,
        reps: item.reps,
        ordem: item.ordem,
        concluida: false
      }));
      await supabase.from(TABLE_ITENS).insert(itemsPayload);
    }
  }
  return true;
}

async function fetchMissionsByDate(dateRef, perfilId = null) {
  if (!perfilId) return [];

  let missionQuery = supabase
    .from(TABLE_MISSOES)
    .select('id, titulo, data_referencia, created_at, perfil_id')
    .eq('data_referencia', dateRef)
    .eq('perfil_id', perfilId)
    .order('created_at', { ascending: true });
  let { data: missionRows, error: mErr } = await missionQuery;
  if (mErr) throw new Error(mErr.message);

  if (!missionRows || missionRows.length === 0) {
    const carriedOver = await autoCarryOverLatestMission(dateRef, perfilId);
    if (carriedOver) {
      const retry = await supabase
        .from(TABLE_MISSOES)
        .select('id, titulo, data_referencia, created_at, perfil_id')
        .eq('data_referencia', dateRef)
        .eq('perfil_id', perfilId)
        .order('created_at', { ascending: true });
      if (retry.error) throw new Error(retry.error.message);
      missionRows = retry.data || [];
    }
  }

  const missionIds = (missionRows || []).map((m) => m.id).filter(Boolean);
  if (!missionIds.length) return [];

  const { data: itemRows, error: iErr } = await supabase
    .from(TABLE_ITENS)
    .select('*')
    .in('missao_id', missionIds)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true });
  if (iErr) throw new Error(iErr.message);

  const grouped = groupMissions(missionRows, itemRows);
  return attachFlamesToMissions(grouped);
}

async function fetchMissionsByProfile(perfilId) {
  if (!perfilId) return [];

  const { data: missionRows, error: mErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id, titulo, data_referencia, created_at, perfil_id')
    .eq('perfil_id', perfilId)
    .order('created_at', { ascending: true });
  if (mErr) throw new Error(mErr.message);
  if (!missionRows?.length) return [];

  const missionIds = missionRows.map((m) => m.id).filter(Boolean);
  const { data: itemRows, error: iErr } = await supabase
    .from(TABLE_ITENS)
    .select('*')
    .in('missao_id', missionIds)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true });
  if (iErr) throw new Error(iErr.message);

  return attachFlamesToMissions(groupMissions(missionRows, itemRows));
}

async function fetchWeeklyMissionsSnapshot(dateRef, todayMissions = [], perfilId = null) {
  if (!perfilId) return [];

  const weekMonday = getMondayOfWeek(dateRef);
  const weekSaturday = addDaysToIsoDate(weekMonday, 5);

  const { data: weekRows, error: wErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id, titulo, data_referencia, created_at, perfil_id')
    .eq('perfil_id', perfilId)
    .gte('data_referencia', weekMonday)
    .lte('data_referencia', weekSaturday)
    .order('created_at', { ascending: false })
    .limit(800);
  if (wErr) throw new Error(wErr.message);

  const selectedWeek = new Map();
  for (const mission of weekRows || []) {
    const weekdayIdx = getWeekdayIndexFromText(mission?.titulo || '');
    if (weekdayIdx < 1 || weekdayIdx > 6) continue;
    if (!selectedWeek.has(weekdayIdx)) selectedWeek.set(weekdayIdx, mission);
  }

  const { data: recentMissionRows, error: mErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id, titulo, data_referencia, created_at, perfil_id')
    .eq('perfil_id', perfilId)
    .lte('data_referencia', dateRef)
    .order('created_at', { ascending: false })
    .limit(800);
  if (mErr) throw new Error(mErr.message);

  const selectedByWeekday = new Map();
  for (const [weekdayIdx, mission] of selectedWeek.entries()) {
    selectedByWeekday.set(weekdayIdx, mission);
  }
  for (const mission of recentMissionRows || []) {
    const weekdayIdx = getWeekdayIndexFromText(mission?.titulo || '');
    if (weekdayIdx < 1 || weekdayIdx > 6) continue;
    if (!selectedByWeekday.has(weekdayIdx)) selectedByWeekday.set(weekdayIdx, mission);
    if (selectedByWeekday.size === 6) break;
  }

  const untitledByTitle = new Map();
  const collectUntitled = (rows) => {
    for (const mission of rows || []) {
      const weekdayIdx = getWeekdayIndexFromText(mission?.titulo || '');
      if (weekdayIdx >= 1 && weekdayIdx <= 6) continue;
      const key = String(mission?.titulo || '').trim().toLowerCase() || `id:${mission.id}`;
      if (!untitledByTitle.has(key)) untitledByTitle.set(key, mission);
    }
  };
  collectUntitled(weekRows);
  collectUntitled(recentMissionRows);

  const merged = new Map();
  for (const mission of todayMissions || []) {
    if (mission?.id) merged.set(mission.id, mission);
  }
  for (const mission of selectedByWeekday.values()) {
    if (mission?.id) merged.set(mission.id, mission);
  }
  for (const mission of untitledByTitle.values()) {
    if (mission?.id) merged.set(mission.id, mission);
  }

  const missionRows = Array.from(merged.values());
  const missionIds = missionRows.map((m) => m.id).filter(Boolean);
  if (!missionIds.length) return [];

  const { data: itemRows, error: iErr } = await supabase
    .from(TABLE_ITENS)
    .select('*')
    .in('missao_id', missionIds)
    .order('ordem', { ascending: true })
    .order('created_at', { ascending: true });
  if (iErr) throw new Error(iErr.message);

  const grouped = groupMissions(missionRows, itemRows);
  grouped.sort((a, b) => {
    const wa = getWeekdayIndexFromText(a?.title || '');
    const wb = getWeekdayIndexFromText(b?.title || '');
    if (wa !== wb) return wa - wb;
    return String(a?.created_at || '').localeCompare(String(b?.created_at || ''));
  });
  return attachFlamesToMissions(grouped);
}

async function seedNextWeekOnSunday(dateRef, perfilId = null) {
  const wd = getWeekdayMonToSunFromIso(dateRef);
  if (wd !== 7 || !perfilId) return;

  const nextMonday = addDaysToIsoDate(dateRef, 1);
  const nextSaturday = addDaysToIsoDate(nextMonday, 5);
  const nextWeekDates = buildWeekDatesFromMonday(nextMonday);

  const { data: existingNextWeek, error: eErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id,titulo,data_referencia')
    .eq('perfil_id', perfilId)
    .gte('data_referencia', nextMonday)
    .lte('data_referencia', nextSaturday);
  if (eErr) throw new Error(eErr.message);

  const existingByWeekday = new Map();
  for (const row of existingNextWeek || []) {
    const idx = getWeekdayIndexFromText(row?.titulo || '');
    if (idx >= 1 && idx <= 6 && !existingByWeekday.has(idx)) existingByWeekday.set(idx, row);
  }

  const { data: recentMissionRows, error: mErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id,titulo,data_referencia,created_at,origem,perfil_id')
    .eq('perfil_id', perfilId)
    .lt('data_referencia', nextMonday)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (mErr) throw new Error(mErr.message);

  const templateByWeekday = new Map();
  for (const mission of recentMissionRows || []) {
    const idx = getWeekdayIndexFromText(mission?.titulo || '');
    if (idx < 1 || idx > 6) continue;
    if (!templateByWeekday.has(idx)) templateByWeekday.set(idx, mission);
    if (templateByWeekday.size === 6) break;
  }

  for (const target of nextWeekDates) {
    if (existingByWeekday.has(target.weekday)) continue;
    const source = templateByWeekday.get(target.weekday);
    if (!source?.id) continue;

    const { data: sourceItems, error: sErr } = await supabase
      .from(TABLE_ITENS)
      .select('*')
      .eq('missao_id', source.id)
      .order('ordem', { ascending: true });
    if (sErr) throw new Error(sErr.message);
    if (!sourceItems || !sourceItems.length) continue;

    const { data: newMission, error: nErr } = await supabase
      .from(TABLE_MISSOES)
      .insert({
        data_referencia: target.dateRef,
        titulo: source.titulo,
        origem: source.origem || 'app',
        perfil_id: perfilId,
      })
      .select('id')
      .single();
    if (nErr || !newMission?.id) continue;

    const payloadItems = sourceItems.map((item) => ({
      missao_id: newMission.id,
      nome: item.nome,
      reps: item.reps,
      ordem: item.ordem,
      concluida: false,
    }));
    const { error: insErr } = await supabase.from(TABLE_ITENS).insert(payloadItems);
    if (insErr) throw new Error(insErr.message);
  }
}

async function fetchMonthlyMissionGoals(history, perfilId = null) {
  const monthRefs = (history || []).map((h) => String(h?.month_ref || '')).filter(Boolean);
  if (!monthRefs.length) return [];

  const firstMonth = monthRefs[monthRefs.length - 1];
  const lastMonth = monthRefs[0];
  const rangeStart = `${firstMonth}-01`;
  const rangeEnd = `${lastMonth}-31`;

  let missionQuery = supabase
    .from(TABLE_MISSOES)
    .select('id,titulo,data_referencia,created_at,perfil_id')
    .gte('data_referencia', rangeStart)
    .lte('data_referencia', rangeEnd)
    .order('data_referencia', { ascending: false })
    .order('created_at', { ascending: false });
  if (perfilId) missionQuery = missionQuery.eq('perfil_id', perfilId);
  const { data: missions, error: mErr } = await missionQuery;
  if (mErr) throw new Error(mErr.message);

  const missionIds = (missions || []).map((m) => m.id).filter(Boolean);
  if (!missionIds.length) {
    return monthRefs.map((monthRef) => ({
      month_ref: monthRef,
      total_goals: 0,
      completed_goals: 0,
      success_rate_percent: 0,
      goals: [],
    }));
  }

  const { data: itemRows, error: iErr } = await supabase
    .from(TABLE_ITENS)
    .select('missao_id,concluida')
    .in('missao_id', missionIds);
  if (iErr) throw new Error(iErr.message);

  const itemMap = new Map();
  for (const id of missionIds) itemMap.set(id, []);
  for (const row of itemRows || []) {
    if (!itemMap.has(row.missao_id)) itemMap.set(row.missao_id, []);
    itemMap.get(row.missao_id).push(Boolean(row.concluida));
  }

  const byMonth = new Map();
  for (const monthRef of monthRefs) byMonth.set(monthRef, []);

  for (const mission of missions || []) {
    const monthRef = String(mission?.data_referencia || '').slice(0, 7);
    if (!byMonth.has(monthRef)) continue;
    const states = itemMap.get(mission.id) || [];
    const totalItems = states.length;
    const doneItems = states.filter(Boolean).length;
    const completed = totalItems > 0 && doneItems === totalItems;
    byMonth.get(monthRef).push({
      mission_id: mission.id,
      title: mission.titulo || 'Novo treino',
      date_ref: mission.data_referencia,
      items_total: totalItems,
      items_completed: doneItems,
      completed,
    });
  }

  return monthRefs.map((monthRef) => {
    const goals = byMonth.get(monthRef) || [];
    const totalGoals = goals.length;
    const completedGoals = goals.filter((g) => g.completed).length;
    const successRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    return {
      month_ref: monthRef,
      total_goals: totalGoals,
      completed_goals: completedGoals,
      success_rate_percent: successRate,
      goals,
    };
  });
}

async function fetchMonthlyPerformance(dateRef, perfilId = null) {
  const { start, end, monthRef } = getMonthRangeFromDateRef(dateRef);
  const cycleTotalDays = 30;
  const history = await fetchMonthlyHistory(monthRef, cycleTotalDays, perfilId);
  const completedCycleDays = Number(history?.[0]?.completed_days || 0);

  let missionQuery = supabase
    .from(TABLE_MISSOES)
    .select('id')
    .gte('data_referencia', start)
    .lte('data_referencia', end);
  if (perfilId) missionQuery = missionQuery.eq('perfil_id', perfilId);
  const { data: missionRows, error: mErr } = await missionQuery;
  if (mErr) throw new Error(mErr.message);

  const missionIds = (missionRows || []).map((m) => m.id).filter(Boolean);
  if (!missionIds.length) {
    const missionGoalsByMonth = await fetchMonthlyMissionGoals(history, perfilId);
    return {
      month_ref: monthRef,
      created_missions: cycleTotalDays,
      completed_missions: completedCycleDays,
      success_rate_percent: Math.round((completedCycleDays / cycleTotalDays) * 100),
      history,
      mission_goals_by_month: missionGoalsByMonth,
      radar: [
        { key: 'forca', label: 'Forca', value: 0, score: 0 },
        { key: 'cardio', label: 'Cardio', value: 0, score: 0 },
        { key: 'core', label: 'Core', value: 0, score: 0 },
        { key: 'mobilidade', label: 'Mobilidade', value: 0, score: 0 },
        { key: 'resistencia', label: 'Resistencia', value: 0, score: 0 },
      ],
    };
  }

  const { data: itemRows, error: iErr } = await supabase
    .from(TABLE_ITENS)
    .select('missao_id,nome,reps,concluida')
    .in('missao_id', missionIds);
  if (iErr) throw new Error(iErr.message);

  const grouped = new Map();
  for (const id of missionIds) grouped.set(id, []);
  for (const row of itemRows || []) {
    if (!grouped.has(row.missao_id)) grouped.set(row.missao_id, []);
    grouped.get(row.missao_id).push(row);
  }

  const radarAcc = {
    forca: 0,
    cardio: 0,
    core: 0,
    mobilidade: 0,
    resistencia: 0,
  };

  const completedRows = (itemRows || []).filter((row) => Boolean(row?.concluida));
  const sourceRows = completedRows.length ? completedRows : (itemRows || []);

  for (const row of sourceRows) {
    const reps = Number(row.reps || 0) || 0;
    if (reps <= 0) continue;
    const distribution = inferRadarDistribution(row.nome || '');
    for (const [key, weight] of Object.entries(distribution)) {
      if (radarAcc[key] == null) continue;
      radarAcc[key] += reps * Number(weight || 0);
    }
  }

  const maxVal = Math.max(...Object.values(radarAcc), 0);
  const toScore = (v) => (maxVal > 0 ? Math.round((v / maxVal) * 100) : 0);
  const radar = [
    { key: 'forca', label: 'Forca', value: radarAcc.forca, score: toScore(radarAcc.forca) },
    { key: 'cardio', label: 'Cardio', value: radarAcc.cardio, score: toScore(radarAcc.cardio) },
    { key: 'core', label: 'Core', value: radarAcc.core, score: toScore(radarAcc.core) },
    { key: 'mobilidade', label: 'Mobilidade', value: radarAcc.mobilidade, score: toScore(radarAcc.mobilidade) },
    { key: 'resistencia', label: 'Resistencia', value: radarAcc.resistencia, score: toScore(radarAcc.resistencia) },
  ];

  const successRatePercent = Math.round((completedCycleDays / cycleTotalDays) * 100);
  const missionGoalsByMonth = await fetchMonthlyMissionGoals(history, perfilId);

  return {
    month_ref: monthRef,
    created_missions: cycleTotalDays,
    completed_missions: completedCycleDays,
    success_rate_percent: successRatePercent,
    history,
    mission_goals_by_month: missionGoalsByMonth,
    radar,
  };
}

function buildMissionFlames(doneDays, currentDay, monthRef) {
  const flames = [];
  for (let d = 1; d <= 30; d += 1) {
    let status = 'blue';
    if (doneDays.has(d)) status = 'off';
    else if (d < Math.min(currentDay, 31)) status = 'orange';
    flames.push({ day: d, status, concluded: doneDays.has(d), month_ref: monthRef });
  }
  return flames;
}

async function attachFlamesToMissions(missions) {
  const { monthRef, day } = getBrazilDateParts();
  const missionIds = (missions || []).map((m) => m.id).filter(Boolean);
  if (!missionIds.length) return missions || [];

  const fallbackFlames = buildMissionFlames(new Set(), day, monthRef);
  const { data, error } = await supabase
    .from(TABLE_CHAMAS)
    .select('dia, concluida')
    .eq('mes_ref', monthRef)
    .eq('concluida', true);

  if (error) {
    if (isMissingChamasTableError(error.message)) {
      return (missions || []).map((mission) => ({ ...mission, flames: fallbackFlames }));
    }
    throw new Error(error.message);
  }

  const doneDays = new Set();
  for (const row of data || []) {
    const d = Number(row.dia);
    if (d < 1 || d > 30) continue;
    doneDays.add(d);
  }

  return (missions || []).map((mission) => ({ ...mission, flames: buildMissionFlames(doneDays, day, monthRef) }));
}

async function markCurrentDayConcluded(missionId) {
  const { monthRef, day } = getBrazilDateParts();
  if (!missionId || day < 1 || day > 30) return;
  const payload = { mission_id: missionId, mes_ref: monthRef, dia: day, concluida: true };
  const { error } = await supabase
    .from(TABLE_CHAMAS)
    .upsert(payload, { onConflict: 'mission_id,mes_ref,dia' });
  if (error && !isMissingChamasTableError(error.message)) throw new Error(error.message);
}

async function getPenaltyState() {
  return { required: false };
}

async function completePenalty(missedDate) {
  void missedDate;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.health === '1') {
      return json(res, 200, { ok: true, service: 'missoes_treino' });
    }

    const auth = await requireUser(req, { appId: 'missoes_treino', adminOnly: true });
    if (!auth.ok) return json(res, auth.status, auth.data);

    if (req.method === 'GET') {
      if (String(req.query?.resource || '') === 'profiles') {
        const profiles = await fetchProfiles();
        return json(res, 200, { profiles });
      }

      const profileId = normalizeProfileId(req.query?.profile_id);
      if (!profileId) {
        return json(res, 400, { error: 'profile_id obrigatório para carregar treinos' });
      }

      await ensureDefaultProfileRows();

      const queryDate = req.query?.date;
      const dateRef = isIsoDate(queryDate) ? String(queryDate) : getTodayBrazilIsoDate();
      const missions = await fetchMissionsByProfile(profileId);
      const penalty = await getPenaltyState();
      const performance = await fetchMonthlyPerformance(dateRef, profileId);
      return json(res, 200, { date: dateRef, profile_id: profileId, missions, penalty, performance, rest_day: false });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      if (String(body?.resource || '') === 'profile') {
        const profile = await createProfile(body);
        return json(res, 201, { profile });
      }

      const profileId = normalizeProfileId(body.profile_id);
      if (!profileId) return json(res, 400, { error: 'profile_id obrigatório para criar missão' });

      const dateRef = isIsoDate(body.date) ? String(body.date) : getTodayBrazilIsoDate();
      const title = normalizeNome(body.title || 'Novo treino') || 'Novo treino';
      const items = normalizeItems(body.items);

      if (!items.length) {
        const name = normalizeNome(body.name);
        const reps = normalizeReps(body.reps);
        if (!name || !reps) return json(res, 400, { error: 'items ou name/reps válidos são obrigatórios' });
        items.push({ nome: name, reps, ordem: 1, concluida: false });
      }

      const { data: mission, error: mErr } = await supabase
        .from(TABLE_MISSOES)
        .insert({ data_referencia: dateRef, titulo: title, origem: 'app', perfil_id: profileId })
        .select('id')
        .single();
      if (mErr) return json(res, 500, { error: mErr.message });

      const payload = items.map((item, idx) => ({
        missao_id: mission.id,
        nome: item.nome,
        reps: item.reps,
        ordem: idx + 1,
        concluida: Boolean(item.concluida),
      }));
      const { error: iErr } = await supabase.from(TABLE_ITENS).insert(payload);
      if (iErr) return json(res, 500, { error: iErr.message });

      const missions = await fetchMissionsByProfile(profileId);
      const created = missions.find((m) => m.id === mission.id) || null;
      return json(res, 201, { mission: created, date: dateRef, profile_id: profileId });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      if (String(body?.resource || '') === 'profile') {
        const profileId = normalizeProfileId(body.profile_id);
        if (!profileId) return json(res, 400, { error: 'profile_id obrigatório' });
        const profile = await updateProfile(profileId, body);
        return json(res, 200, { profile });
      }

      if (body?.action === 'complete_penalty') {
        const missedDate = String(body.missed_date || '');
        await completePenalty(missedDate);
        return json(res, 200, { ok: true });
      }

      const missionId = String(body.mission_id || '').trim();
      if (missionId) {
        if (body.completed != null) {
          const completedValue = Boolean(body.completed);
          if (!completedValue) return json(res, 409, { error: 'Conclusão diária imutável: não é possível desfazer.' });
          const { error } = await supabase
            .from(TABLE_ITENS)
            .update({ concluida: completedValue })
            .eq('missao_id', missionId);
          if (error) return json(res, 500, { error: error.message });
          await markCurrentDayConcluded(missionId);
          return json(res, 200, { ok: true });
        }

        if (Array.isArray(body.replace_items)) {
          const items = normalizeItems(body.replace_items);
          if (!items.length) return json(res, 400, { error: 'replace_items precisa ter ao menos 1 item válido' });

          const title = normalizeNome(body.title || '');
          if (title) {
            const { error: titleErr } = await supabase
              .from(TABLE_MISSOES)
              .update({ titulo: title })
              .eq('id', missionId);
            if (titleErr) return json(res, 500, { error: titleErr.message });
          }

          const { error: delErr } = await supabase.from(TABLE_ITENS).delete().eq('missao_id', missionId);
          if (delErr) return json(res, 500, { error: delErr.message });

          const payload = items.map((item, idx) => ({
            missao_id: missionId,
            nome: item.nome,
            reps: item.reps,
            ordem: idx + 1,
            concluida: Boolean(item.concluida),
          }));
          const { error: insErr } = await supabase.from(TABLE_ITENS).insert(payload);
          if (insErr) return json(res, 500, { error: insErr.message });

          return json(res, 200, { ok: true });
        }
      }

      const id = String(body.id || '').trim();
      if (!id) return json(res, 400, { error: 'mission_id ou id obrigatório' });

      const payload = {};
      if (body.name != null) payload.nome = normalizeNome(body.name);
      if (body.reps != null) {
        const reps = normalizeReps(body.reps);
        if (!reps) return json(res, 400, { error: 'reps inválido' });
        payload.reps = reps;
      }
      if (body.completed != null) payload.concluida = Boolean(body.completed);
      if (payload.concluida === false) return json(res, 409, { error: 'Conclusão diária imutável: não é possível desfazer.' });
      if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });

      const { data, error } = await supabase
        .from(TABLE_ITENS)
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { item: data });
    }

    if (req.method === 'DELETE') {
      const body = parseBody(req);
      if (String(body?.resource || '') === 'profile' || String(req.query?.resource || '') === 'profile') {
        const profileId = normalizeProfileId(body.profile_id ?? req.query?.profile_id);
        if (!profileId) return json(res, 400, { error: 'profile_id obrigatório' });
        const result = await deleteProfile(profileId);
        return json(res, 200, result);
      }

      const missionId = String(body.mission_id ?? req.query?.mission_id ?? '').trim();
      if (missionId) {
        const { error: delItemsErr } = await supabase.from(TABLE_ITENS).delete().eq('missao_id', missionId);
        if (delItemsErr) return json(res, 500, { error: delItemsErr.message });

        const { error: delFlamesErr } = await supabase.from(TABLE_CHAMAS).delete().eq('mission_id', missionId);
        if (delFlamesErr && !isMissingChamasTableError(delFlamesErr.message)) {
          return json(res, 500, { error: delFlamesErr.message });
        }

        const { error: delMissionErr } = await supabase.from(TABLE_MISSOES).delete().eq('id', missionId);
        if (delMissionErr) return json(res, 500, { error: delMissionErr.message });
        return json(res, 200, { ok: true, mission_id: missionId });
      }

      const id = String(body.id ?? req.query?.id ?? '').trim();
      if (!id) return json(res, 400, { error: 'mission_id ou id obrigatório' });
      const { error } = await supabase.from(TABLE_ITENS).delete().eq('id', id);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err) {
    const message = String(err?.message || 'Falha no módulo de missões de treino');
    const lower = message.toLowerCase();
    const setupRequired =
      lower.includes('does not exist') ||
      lower.includes('permission denied') ||
      lower.includes('relation') ||
      lower.includes('rls');
    if (setupRequired) {
      return json(res, 500, {
        error:
          'Banco de missões ainda não configurado. Execute no Supabase os SQL em migration/: 20260407_add_missoes_treino_tables.sql, 20260408_allow_multiple_missoes_treino_per_day.sql, 20260408_add_missoes_treino_chamas.sql, 20260408_link_chamas_to_missao.sql e 20260812_add_missoes_treino_perfis.sql.',
        details: message,
        setup_required: true,
      });
    }
    return json(res, 500, { error: message });
  }
}
