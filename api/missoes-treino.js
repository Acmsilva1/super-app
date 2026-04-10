import { supabase } from '../lib/supabase.js';

const TABLE_MISSOES = 'tb_missoes_treino';
const TABLE_ITENS = 'tb_missoes_treino_itens';
const TABLE_CHAMAS = 'tb_missoes_treino_chamas';
const TABLE_PENALIDADES = 'tb_missoes_treino_penalidades';

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

function getTodayBrazilIsoDate() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function getMonthRangeFromDateRef(dateRef) {
  const [year, month] = String(dateRef).split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const monthRef = `${year}-${String(month).padStart(2, '0')}`;
  return { start, end, monthRef };
}

function getBrazilDatePartsFrom(dateObj) {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const monthFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  });
  const isoDate = dateFmt.format(dateObj);
  const monthRef = monthFmt.format(dateObj);
  const day = Number(isoDate.split('-')[2] || 1);
  return { isoDate, monthRef, day };
}

function getBrazilDateParts() {
  return getBrazilDatePartsFrom(new Date());
}

function getYesterdayBrazilDateParts() {
  return getBrazilDatePartsFrom(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
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

function isMissingPenalidadesTableError(message) {
  const lower = String(message || '').toLowerCase();
  return (
    lower.includes('tb_missoes_treino_penalidades') &&
    (lower.includes('does not exist') || lower.includes('schema cache') || lower.includes('relation'))
  );
}

function groupMissions(missionRows, itemRows) {
  const grouped = new Map();
  for (const mission of missionRows || []) {
    grouped.set(mission.id, {
      id: mission.id,
      title: mission.titulo || 'Missao diaria',
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

async function autoCarryOverLatestMission(dateRef) {
  const { data: latestMissions, error: mErr } = await supabase
    .from(TABLE_MISSOES)
    .select('data_referencia')
    .lt('data_referencia', dateRef)
    .order('data_referencia', { ascending: false })
    .limit(1);

  if (mErr) throw new Error(mErr.message);
  if (!latestMissions || latestMissions.length === 0) return false;
  
  const prevDate = latestMissions[0].data_referencia;

  const { data: oldMissions, error: omErr } = await supabase
    .from(TABLE_MISSOES)
    .select('*')
    .eq('data_referencia', prevDate);
  
  if (omErr || !oldMissions || oldMissions.length === 0) return false;
  
  const oldMissionIds = oldMissions.map(m => m.id);

  const { data: oldItems, error: oiErr } = await supabase
    .from(TABLE_ITENS)
    .select('*')
    .in('missao_id', oldMissionIds)
    .order('ordem', { ascending: true });
  
  if (oiErr) throw new Error(oiErr.message);

  for (const oldM of oldMissions) {
    const { data: newM, error: newMErr } = await supabase
      .from(TABLE_MISSOES)
      .insert({ data_referencia: dateRef, titulo: oldM.titulo, origem: oldM.origem })
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

async function fetchMissionsByDate(dateRef) {
  let { data: missionRows, error: mErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id, titulo, data_referencia, created_at')
    .eq('data_referencia', dateRef)
    .order('created_at', { ascending: true });
  if (mErr) throw new Error(mErr.message);

  if (!missionRows || missionRows.length === 0) {
    const todayStr = getTodayBrazilIsoDate();
    if (dateRef === todayStr) {
      const carried = await autoCarryOverLatestMission(dateRef);
      if (carried) {
        const { data: newRows, error: newErr } = await supabase
          .from(TABLE_MISSOES)
          .select('id, titulo, data_referencia, created_at')
          .eq('data_referencia', dateRef)
          .order('created_at', { ascending: true });
        if (!newErr && newRows) {
          missionRows = newRows;
        }
      }
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

async function fetchMonthlyPerformance(dateRef) {
  const { start, end, monthRef } = getMonthRangeFromDateRef(dateRef);
  const { data: missionRows, error: mErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id')
    .gte('data_referencia', start)
    .lte('data_referencia', end);
  if (mErr) throw new Error(mErr.message);

  const missionIds = (missionRows || []).map((m) => m.id).filter(Boolean);
  if (!missionIds.length) {
    return {
      month_ref: monthRef,
      created_missions: 0,
      completed_missions: 0,
      success_rate_percent: 0,
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

  let completedMissions = 0;
  for (const id of missionIds) {
    const items = grouped.get(id) || [];
    if (items.length && items.every((it) => Boolean(it.concluida))) completedMissions += 1;
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

  const created = missionIds.length;
  const successRatePercent = created ? Math.round((completedMissions / created) * 100) : 0;

  return {
    month_ref: monthRef,
    created_missions: created,
    completed_missions: completedMissions,
    success_rate_percent: successRatePercent,
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
  const yesterday = getYesterdayBrazilDateParts();

  const { data: anyMission, error: mErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id')
    .limit(1);
  if (mErr) throw new Error(mErr.message);
  if (!anyMission?.length) {
    return { required: false };
  }

  const { data: doneYesterday, error: dErr } = await supabase
    .from(TABLE_CHAMAS)
    .select('id')
    .eq('mes_ref', yesterday.monthRef)
    .eq('dia', yesterday.day)
    .eq('concluida', true)
    .limit(1);
  if (dErr && !isMissingChamasTableError(dErr.message)) throw new Error(dErr.message);
  if (doneYesterday?.length) return { required: false };

  const { data: penRows, error: pErr } = await supabase
    .from(TABLE_PENALIDADES)
    .select('*')
    .eq('missed_date', yesterday.isoDate)
    .limit(1);
  if (pErr) {
    if (isMissingPenalidadesTableError(pErr.message)) return { required: false, fallback: true };
    throw new Error(pErr.message);
  }

  const existing = penRows?.[0];
  if (existing?.status === 'completed') return { required: false };

  if (!existing) {
    const { error: insErr } = await supabase
      .from(TABLE_PENALIDADES)
      .insert({
        missed_date: yesterday.isoDate,
        status: 'pending',
        penalty_title: 'MISSAO DE PENALIDADE',
        penalty_text: 'FACA 20 BURPEES',
      });
    if (insErr && !isMissingPenalidadesTableError(insErr.message)) throw new Error(insErr.message);
  }

  return {
    required: true,
    missed_date: yesterday.isoDate,
    title: 'MISSAO DE PENALIDADE',
    text: 'FACA 20 BURPEES',
  };
}

async function completePenalty(missedDate) {
  if (!isIsoDate(missedDate)) return;
  const { data: rows, error: findErr } = await supabase
    .from(TABLE_PENALIDADES)
    .select('id')
    .eq('missed_date', missedDate)
    .limit(1);
  if (findErr) {
    if (isMissingPenalidadesTableError(findErr.message)) return;
    throw new Error(findErr.message);
  }

  if (!rows?.length) {
    const { error: insErr } = await supabase
      .from(TABLE_PENALIDADES)
      .insert({
        missed_date: missedDate,
        status: 'completed',
        penalty_title: 'MISSAO DE PENALIDADE',
        penalty_text: 'FACA 20 BURPEES',
        completed_at: new Date().toISOString(),
      });
    if (insErr && !isMissingPenalidadesTableError(insErr.message)) throw new Error(insErr.message);
    return;
  }

  const { error: updErr } = await supabase
    .from(TABLE_PENALIDADES)
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', rows[0].id);
  if (updErr && !isMissingPenalidadesTableError(updErr.message)) throw new Error(updErr.message);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const queryDate = req.query?.date;
      const dateRef = isIsoDate(queryDate) ? String(queryDate) : getTodayBrazilIsoDate();
      const missions = await fetchMissionsByDate(dateRef);
      const penalty = await getPenaltyState();
      const performance = await fetchMonthlyPerformance(dateRef);
      return json(res, 200, { date: dateRef, missions, penalty, performance });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const dateRef = isIsoDate(body.date) ? String(body.date) : getTodayBrazilIsoDate();
      const title = normalizeNome(body.title || 'Missao diaria') || 'Missao diaria';
      const items = normalizeItems(body.items);

      if (!items.length) {
        const name = normalizeNome(body.name);
        const reps = normalizeReps(body.reps);
        if (!name || !reps) return json(res, 400, { error: 'items ou name/reps validos sao obrigatorios' });
        items.push({ nome: name, reps, ordem: 1, concluida: false });
      }

      const { data: mission, error: mErr } = await supabase
        .from(TABLE_MISSOES)
        .insert({ data_referencia: dateRef, titulo: title, origem: 'app' })
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

      const missions = await fetchMissionsByDate(dateRef);
      const created = missions.find((m) => m.id === mission.id) || null;
      return json(res, 201, { mission: created, date: dateRef });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      if (body?.action === 'complete_penalty') {
        const missedDate = String(body.missed_date || '');
        await completePenalty(missedDate);
        return json(res, 200, { ok: true });
      }

      const missionId = String(body.mission_id || '').trim();
      if (missionId) {
        if (body.completed != null) {
          const completedValue = Boolean(body.completed);
          if (!completedValue) return json(res, 409, { error: 'Conclusao diaria imutavel: nao e possivel desfazer.' });
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
          if (!items.length) return json(res, 400, { error: 'replace_items precisa ter ao menos 1 item valido' });

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
      if (!id) return json(res, 400, { error: 'mission_id ou id obrigatorio' });

      const payload = {};
      if (body.name != null) payload.nome = normalizeNome(body.name);
      if (body.reps != null) {
        const reps = normalizeReps(body.reps);
        if (!reps) return json(res, 400, { error: 'reps invalido' });
        payload.reps = reps;
      }
      if (body.completed != null) payload.concluida = Boolean(body.completed);
      if (payload.concluida === false) return json(res, 409, { error: 'Conclusao diaria imutavel: nao e possivel desfazer.' });
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
      const missionId = String(body.mission_id ?? req.query?.mission_id ?? '').trim();
      if (missionId) {
        const { error } = await supabase.from(TABLE_MISSOES).delete().eq('id', missionId);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true });
      }

      const id = String(body.id ?? req.query?.id ?? '').trim();
      if (!id) return json(res, 400, { error: 'mission_id ou id obrigatorio' });
      const { error } = await supabase.from(TABLE_ITENS).delete().eq('id', id);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err) {
    const message = String(err?.message || 'Falha no modulo de missoes de treino');
    const lower = message.toLowerCase();
    const setupRequired =
      lower.includes('does not exist') ||
      lower.includes('permission denied') ||
      lower.includes('relation') ||
      lower.includes('rls');
    if (setupRequired) {
      return json(res, 500, {
        error:
          'Banco de missoes ainda nao configurado. Execute os SQL: 20260407_add_missoes_treino_tables.sql, 20260408_allow_multiple_missoes_treino_per_day.sql, 20260408_add_missoes_treino_chamas.sql, 20260408_link_chamas_to_missao.sql e 20260408_add_missoes_treino_penalidades.sql no Supabase.',
        details: message,
        setup_required: true,
      });
    }
    return json(res, 500, { error: message });
  }
}
