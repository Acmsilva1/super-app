/** Modelo alinhado à tb_saude_familiar (LGPD). Campos: id, created_at, membro_familia, tipo_registro, detalhes, data_evento, anexo_url */
export const TABLE_NAME = 'tb_saude_familiar';

export const TIPOS_REGISTRO = ['Vacina', 'Exame', 'Consulta', 'Medicamento'];

export class RegistroSaude {
  constructor({
    membro_familia,
    tipo_registro,
    detalhes = '',
    data_evento = null,
    anexo_url = null,
    id = null,
    created_at = null,
  }) {
    this.membro_familia = membro_familia ?? '';
    this.tipo_registro = tipo_registro ?? '';
    this.detalhes = detalhes ?? '';
    this.data_evento = data_evento ?? null;
    this.anexo_url = anexo_url ?? null;
    this.id = id ?? null;
    this.created_at = created_at ?? null;
  }

  toInsert() {
    const payload = {
      membro_familia: this.membro_familia || '',
      tipo_registro: this.tipo_registro || '',
      detalhes: this.detalhes || '',
    };
    if (this.data_evento) payload.data_evento = this.data_evento;
    if (this.anexo_url) payload.anexo_url = this.anexo_url;
    return payload;
  }

  static fromRow(row) {
    return new RegistroSaude({
      id: row?.id,
      created_at: row?.created_at,
      membro_familia: row?.membro_familia || '',
      tipo_registro: row?.tipo_registro || '',
      detalhes: row?.detalhes || '',
      data_evento: row?.data_evento,
      anexo_url: row?.anexo_url,
    });
  }
}
