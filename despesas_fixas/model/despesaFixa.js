/** Modelo alinhado à tb_despesas_fixas. Campos: id, created_at, descricao, valor, status (pago|pendente) */
export const TABLE_NAME = 'tb_despesas_fixas';

export const STATUS_PAGO = 'pago';
export const STATUS_PENDENTE = 'pendente';

export class DespesaFixa {
  constructor({ descricao, valor, status = STATUS_PENDENTE, id = null, created_at = null }) {
    this.descricao = descricao ?? '';
    this.valor = Number(valor) ?? 0;
    this.status = status === STATUS_PAGO || status === STATUS_PENDENTE ? status : STATUS_PENDENTE;
    this.id = id ?? null;
    this.created_at = created_at ?? null;
  }

  toInsert() {
    return {
      descricao: this.descricao || '',
      valor: Math.round(Number(this.valor) * 100) / 100,
      status: this.status,
    };
  }

  static fromRow(row) {
    return new DespesaFixa({
      id: row?.id,
      created_at: row?.created_at,
      descricao: row?.descricao || '',
      valor: Number(row?.valor ?? 0),
      status: row?.status === 'pago' ? 'pago' : 'pendente',
    });
  }
}
