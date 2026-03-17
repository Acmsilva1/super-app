/** Modelo alinhado à tb_notas. Campos: id, created_at, titulo, conteudo, tags[], usuario_id */
export const TABLE_NAME = 'tb_notas';

export class Nota {
  constructor({ titulo, conteudo = '', tags = null, usuario_id = null, id = null, created_at = null }) {
    this.titulo = titulo ?? '';
    this.conteudo = conteudo ?? '';
    this.tags = tags ?? [];
    this.usuario_id = usuario_id ?? null;
    this.id = id ?? null;
    this.created_at = created_at ?? null;
  }

  toInsert() {
    const payload = {
      titulo: this.titulo || '',
      conteudo: this.conteudo || '',
      tags: this.tags || [],
    };
    if (this.usuario_id) payload.usuario_id = this.usuario_id;
    return payload;
  }

  static fromRow(row) {
    return new Nota({
      id: row?.id,
      created_at: row?.created_at,
      titulo: row?.titulo || '',
      conteudo: row?.conteudo || '',
      tags: row?.tags || [],
      usuario_id: row?.usuario_id,
    });
  }
}
