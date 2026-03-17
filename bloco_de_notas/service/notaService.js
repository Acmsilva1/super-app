import { Nota } from '../model/nota.js';

export function validarTitulo(titulo) {
  return Boolean((titulo || '').trim());
}

export function payloadInsert(titulo, conteudo = '', tags = null, usuario_id = null) {
  const payload = {
    titulo: (titulo || '').trim(),
    conteudo: (conteudo || '').trim(),
    tags: Array.isArray(tags) ? [...tags] : [],
  };
  if (usuario_id) payload.usuario_id = usuario_id;
  return payload;
}

export function payloadUpdate(titulo = undefined, conteudo = undefined, tags = undefined) {
  const out = {};
  if (titulo !== undefined) out.titulo = String(titulo).trim();
  if (conteudo !== undefined) out.conteudo = String(conteudo).trim();
  if (tags !== undefined) out.tags = Array.isArray(tags) ? [...tags] : [];
  return out;
}

export function filtrarPorUsuario(rows, usuario_id) {
  if (!usuario_id) return rows;
  return rows.filter((r) => String(r?.usuario_id ?? '') === String(usuario_id));
}

export function buscarPorTags(rows, tag) {
  const t = (tag || '').trim().toLowerCase();
  if (!t) return rows;
  return rows.filter((r) => (r?.tags ?? []).some((x) => String(x).toLowerCase() === t));
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => Nota.fromRow(r));
}
