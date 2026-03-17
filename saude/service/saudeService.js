import { RegistroSaude } from '../model/registroSaude.js';

export function payloadInsert(
  membro_familia,
  tipo_registro,
  detalhes = '',
  data_evento = null,
  anexo_url = null
) {
  const payload = {
    membro_familia: (membro_familia || '').trim(),
    tipo_registro: (tipo_registro || '').trim(),
    detalhes: (detalhes || '').trim(),
  };
  if (data_evento) payload.data_evento = data_evento;
  if (anexo_url) payload.anexo_url = anexo_url;
  return payload;
}

export function payloadUpdate(
  membro_familia = undefined,
  tipo_registro = undefined,
  detalhes = undefined,
  data_evento = undefined,
  anexo_url = undefined
) {
  const out = {};
  if (membro_familia !== undefined) out.membro_familia = String(membro_familia).trim();
  if (tipo_registro !== undefined) out.tipo_registro = String(tipo_registro).trim();
  if (detalhes !== undefined) out.detalhes = String(detalhes).trim();
  if (data_evento !== undefined) out.data_evento = data_evento;
  if (anexo_url !== undefined) out.anexo_url = anexo_url;
  return out;
}

export function filtrarPorMembro(rows, membro_familia) {
  if (!membro_familia) return rows ?? [];
  const m = String(membro_familia).trim().toLowerCase();
  return (rows ?? []).filter((r) => (r?.membro_familia ?? '').trim().toLowerCase() === m);
}

export function filtrarPorTipo(rows, tipo_registro) {
  if (!tipo_registro) return rows ?? [];
  const t = String(tipo_registro).trim().toLowerCase();
  return (rows ?? []).filter((r) => (r?.tipo_registro ?? '').trim().toLowerCase() === t);
}

export function obterUltimoPorTipo(rows, membro_familia, tipo_registro) {
  const filtrados = filtrarPorTipo(filtrarPorMembro(rows, membro_familia), tipo_registro);
  if (!filtrados.length) return null;
  const comData = filtrados.map((r) => [r, r?.data_evento || r?.created_at || '']);
  comData.sort((a, b) => (b[1] > a[1] ? 1 : -1));
  return comData[0][0];
}

function _detalhes(r) {
  return r ? (r?.detalhes ?? '').trim() : '';
}
function _data(r) {
  return r ? (r?.data_evento || r?.created_at || '') : '';
}

export function renderizarResumo(rows, membro_familia) {
  const ultimaVacina = obterUltimoPorTipo(rows, membro_familia, 'Vacina');
  const ultimaConsulta = obterUltimoPorTipo(rows, membro_familia, 'Consulta');
  const ultimoMedicamento = obterUltimoPorTipo(rows, membro_familia, 'Medicamento');
  return {
    ultima_vacina: ultimaVacina
      ? { detalhes: _detalhes(ultimaVacina), data: _data(ultimaVacina) }
      : { detalhes: 'Nada registrado', data: '' },
    ultima_consulta: ultimaConsulta
      ? { detalhes: _detalhes(ultimaConsulta), data: _data(ultimaConsulta) }
      : { detalhes: 'Sem histórico', data: '' },
    medicamento_ativo: ultimoMedicamento
      ? { detalhes: _detalhes(ultimoMedicamento) }
      : { detalhes: 'Nenhum medicamento' },
  };
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => RegistroSaude.fromRow(r));
}

/** Retorna o id do registro para uso em exclusão (DELETE). */
export function idParaExclusao(registro) {
  if (registro instanceof RegistroSaude) return registro.id ?? null;
  if (registro && typeof registro === 'object' && 'id' in registro) return registro.id ?? null;
  return null;
}
