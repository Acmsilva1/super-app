import { STATUS_TAREFA, TarefaJobson } from '../model/tarefaModel.js';

function normalizarHora(hora) {
  const t = String(hora || '').trim();
  if (!t) return null;
  return t.slice(0, 5);
}

export function payloadInsert(
  descricao,
  data,
  slot_hora,
  status = 'pendente',
  notificado = false
) {
  const tarefa = new TarefaJobson({
    descricao: (descricao || '').trim(),
    data: data || null,
    slot_hora: normalizarHora(slot_hora),
    status: STATUS_TAREFA.includes(status) ? status : 'pendente',
    notificado: Boolean(notificado),
  });
  return tarefa.toInsert();
}

export function payloadUpdate(
  descricao = undefined,
  data = undefined,
  slot_hora = undefined,
  status = undefined,
  notificado = undefined
) {
  const out = {};
  if (descricao !== undefined) out.descricao = String(descricao).trim();
  if (data !== undefined) out.data = data || null;
  if (slot_hora !== undefined) out.slot_hora = normalizarHora(slot_hora);
  if (status !== undefined) out.status = STATUS_TAREFA.includes(status) ? status : 'pendente';
  if (notificado !== undefined) out.notificado = Boolean(notificado);
  return out;
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => TarefaJobson.fromRow(r));
}

export function ordenarPorDataHora(rows) {
  return [...(rows || [])].sort((a, b) => {
    const da = String(a?.data || '');
    const db = String(b?.data || '');
    if (da !== db) return db.localeCompare(da);
    const ha = String(a?.slot_hora || '');
    const hb = String(b?.slot_hora || '');
    if (ha !== hb) return hb.localeCompare(ha);
    const ca = String(a?.created_at || '');
    const cb = String(b?.created_at || '');
    return cb.localeCompare(ca);
  });
}
