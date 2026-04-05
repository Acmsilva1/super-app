/** Modelo alinhado a tb_lista_compras. Campos: id, created_at, item, quantidade, unidade_medida, comprado, categoria */
export const TABLE_NAME = 'tb_lista_compras';

export const CATEGORIAS_LISTA = [
  'Mantimentos',
  'Higiene / limpeza',
  'Feira',
  'Carnes',
];

export class ItemLista {
  constructor({
    item,
    quantidade = 1,
    unidade_medida = null,
    comprado = false,
    categoria = CATEGORIAS_LISTA[0],
    id = null,
    created_at = null,
  }) {
    this.item = item ?? '';
    this.quantidade = Math.max(1, Number(quantidade) || 1);
    this.unidade_medida = unidade_medida ?? null;
    this.comprado = Boolean(comprado);
    this.categoria = CATEGORIAS_LISTA.includes(categoria) ? categoria : CATEGORIAS_LISTA[0];
    this.id = id ?? null;
    this.created_at = created_at ?? null;
  }

  toInsert() {
    const payload = {
      item: this.item || '',
      quantidade: Math.max(1, this.quantidade),
      comprado: Boolean(this.comprado),
      categoria: this.categoria || CATEGORIAS_LISTA[0],
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
      categoria: row?.categoria && CATEGORIAS_LISTA.includes(row.categoria) ? row.categoria : CATEGORIAS_LISTA[0],
    });
  }
}
