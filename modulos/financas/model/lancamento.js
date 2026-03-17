/** Modelo alinhado à tb_financas. Input manual: descrição, valor, tipo (receita/despesa), categoria. */
export const TABLE_NAME = 'tb_financas';

export const MAPA_CATEGORIAS = {
  'Alimentação': [
    'mercado', 'hortifruti', 'restaurante', 'ifood', 'comida', 'padaria', 'lanche',
    'picolé', 'biscoito', 'bala', 'doce', 'sorvete', 'café', 'bebida', 'açougue',
    'supermercado', 'feira', 'confeitaria', 'marmita', 'delivery', 'vinho', 'cerveja',
  ],
  'Habitação': [
    'luz', 'água', 'internet', 'condomínio', 'boleto', 'reforma', 'limpeza',
    'aluguel', 'iptu', 'gás', 'móveis', 'decoração', 'manutenção', 'reparos', 'lavanderia',
  ],
  'Transporte': [
    'uber', 'gasolina', 'combustível', 'estacionamento', 'pedágio', 'oficina',
    '99pop', 'ônibus', 'metrô', 'ipva', 'seguro auto', 'troca de óleo', 'pneu', 'licenciamento',
  ],
  'Lazer': [
    'cinema', 'viagem', 'netflix', 'bar', 'spotify', 'praia', 'games', 'show',
    'teatro', 'hospedagem', 'passagem aérea', 'livro', 'hbomax', 'disney+', 'estádio', 'futebol',
  ],
  'Saúde': [
    'farmácia', 'médico', 'academia', 'suplemento', 'dentista', 'exame',
    'consulta', 'psicólogo', 'hospital', 'plano de saúde', 'drogaria', 'ótica',
  ],
  'Compras': [
    'shopee', 'amazon', 'shein', 'mercado livre', 'roupas', 'eletrônicos',
    'eletrodoméstico', 'presente', 'magalu', 'ali-express', 'perfume', 'cosmético', 'tenis', 'acessórios',
  ],
  'Contas': [
    'faculdade', 'esporte', 'serviços bancários', 'pensão', 'celular', 'assinatura',
    'imposto', 'cartão de crédito', 'empréstimo', 'tarifa', 'seguro', 'anuidade', 'mei', 'irpf',
  ],
  'Receitas': [
    'salário', 'ticket', 'vale', 'vendas', 'recebi', 'pix recebido', 'reembolso',
    'lucro de bolo', 'rendimento', 'dividendo', 'bônus', 'décimo terceiro', 'extra', 'freelance',
  ],
};

export const CATEGORIAS_FORM = Object.keys(MAPA_CATEGORIAS);

export class LancamentoFinanca {
  constructor({
    descricao,
    valor,
    tipo,
    categoria = null,
    data_lancamento = null,
    metodo_pagamento = null,
    id = null,
    created_at = null,
  }) {
    this.descricao = descricao ?? '';
    this.valor = Number(valor) ?? 0;
    this.tipo = (tipo === 'receita' || tipo === 'despesa') ? tipo : 'despesa';
    this.categoria = categoria ?? null;
    this.data_lancamento = data_lancamento ?? null;
    this.metodo_pagamento = metodo_pagamento ?? null;
    this.id = id ?? null;
    this.created_at = created_at ?? null;
  }

  toInsert() {
    const payload = {
      descricao: this.descricao || '',
      valor: Math.round(Number(this.valor) * 100) / 100,
      tipo: (this.tipo === 'receita' || this.tipo === 'despesa') ? this.tipo : 'despesa',
    };
    if (this.categoria) payload.categoria = this.categoria;
    if (this.data_lancamento) payload.data_lancamento = this.data_lancamento;
    if (this.metodo_pagamento) payload.metodo_pagamento = this.metodo_pagamento;
    return payload;
  }

  static fromRow(row) {
    return new LancamentoFinanca({
      id: row?.id,
      created_at: row?.created_at,
      descricao: row?.descricao || '',
      valor: Number(row?.valor ?? 0),
      tipo: (row?.tipo || 'despesa').toLowerCase(),
      categoria: row?.categoria,
      data_lancamento: row?.data_lancamento,
      metodo_pagamento: row?.metodo_pagamento,
    });
  }
}
