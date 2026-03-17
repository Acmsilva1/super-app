/** Modelo alinhado à tb_lista_compras. Campos: id, created_at, item, quantidade, unidade_medida, comprado, prioridade */
export const TABLE_NAME = 'tb_lista_compras';

export const PRIORIDADE_BAIXA = 1;
export const PRIORIDADE_MEDIA = 2;
export const PRIORIDADE_ALTA = 3;

export class ItemLista {
  constructor({
    item,
    quantidade = 1,
    unidade_medida = null,
    comprado = false,
    prioridade = PRIORIDADE_BAIXA,
    id = null,
    created_at = null,
  }) {
    this.item = item ?? '';
    this.quantidade = Math.max(1, Number(quantidade) || 1);
    this.unidade_medida = unidade_medida ?? null;
    this.comprado = Boolean(comprado);
    this.prioridade = Math.max(1, Math.min(3, Number(prioridade) || PRIORIDADE_BAIXA));
    this.id = id ?? null;
    this.created_at = created_at ?? null;
  }

  toInsert() {
    const payload = {
      item: this.item || '',
      quantidade: Math.max(1, this.quantidade),
      comprado: Boolean(this.comprado),
      prioridade: Math.max(1, Math.min(3, this.prioridade)),
    };
    if (this.unidade_medida) payload.unidade_medida = this.unidade_medida;
    return payload;
  }

  static fromRow(row) {
    return new ItemLista({
      id: row?.id,
      created_at: row?.created_at,
      item: row?.item || '',
      quantidade: row?.quantidade ?? 1,
      unidade_medida: row?.unidade_medida,
      comprado: Boolean(row?.comprado ?? false),
      prioridade: row?.prioridade ?? PRIORIDADE_BAIXA,
    });
  }
}
