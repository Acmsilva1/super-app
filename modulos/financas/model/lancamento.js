/** Modelo alinhado a tb_financas. Input manual: descricao, valor, tipo (receita/despesa), categoria. */
export const TABLE_NAME = 'tb_financas';

export const MAPA_CATEGORIAS = {
  'Alimentacao': [
    'mercado', 'hortifruti', 'restaurante', 'ifood', 'comida', 'padaria', 'lanche',
    'picole', 'biscoito', 'bala', 'doce', 'sorvete', 'cafe', 'bebida', 'acougue',
    'supermercado', 'feira', 'confeitaria', 'marmita', 'delivery', 'vinho', 'cerveja',
  ],
  'Habitacao': [
    'luz', 'agua', 'internet', 'condominio', 'boleto', 'reforma', 'limpeza',
    'aluguel', 'iptu', 'gas', 'moveis', 'decoracao', 'manutencao', 'reparos', 'lavanderia',
  ],
  'Transporte': [
    'uber', 'gasolina', 'combustivel', 'estacionamento', 'pedagio', 'oficina',
    '99pop', 'onibus', 'metro', 'ipva', 'seguro auto', 'troca de oleo', 'pneu', 'licenciamento',
  ],
  'Lazer': [
    'cinema', 'viagem', 'netflix', 'bar', 'spotify', 'praia', 'games', 'show',
    'teatro', 'hospedagem', 'passagem aerea', 'livro', 'hbomax', 'disney+', 'estadio', 'futebol',
  ],
  'Saude': [
    'farmacia', 'medico', 'academia', 'suplemento', 'dentista', 'exame',
    'consulta', 'psicologo', 'hospital', 'plano de saude', 'drogaria', 'otica',
  ],
  'Compras': [
    'shopee', 'amazon', 'shein', 'mercado livre', 'roupas', 'eletronicos',
    'eletrodomestico', 'presente', 'magalu', 'ali-express', 'perfume', 'cosmetico', 'tenis', 'acessorios',
  ],
  'Contas': [
    'faculdade', 'esporte', 'servicos bancarios', 'pensao', 'celular', 'assinatura',
    'imposto', 'cartao de credito', 'emprestimo', 'tarifa', 'seguro', 'anuidade', 'mei', 'irpf',
  ],
  'Tickt': [
    'tickt', 'ticket',
  ],
  'Receitas': [
    'salario', 'ticket', 'vale', 'vendas', 'recebi', 'pix recebido', 'reembolso',
    'lucro de bolo', 'rendimento', 'dividendo', 'bonus', 'decimo terceiro', 'extra', 'freelance',
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
