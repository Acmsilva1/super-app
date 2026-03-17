-- Schema único para o Super App (Supabase). Rodar no SQL Editor.
-- Cria tb_notas, tb_financas, tb_lista_compras, tb_saude_familiar.

-- 1) Bloco de Notas (despesas fixas: descrição, valor, status pago/pendente, soma no final)
CREATE TABLE IF NOT EXISTS public.tb_despesas_fixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pago', 'pendente'))
);

COMMENT ON TABLE public.tb_despesas_fixas IS 'Bloco de Notas – registro de despesas fixas (descrição, valor, pago/pendente)';

-- Legado: tabela de notas livre (opcional)
CREATE TABLE IF NOT EXISTS public.tb_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  usuario_id UUID
);

COMMENT ON TABLE public.tb_notas IS 'Notas livres (legado)';

-- 2) Finanças (input manual: descrição, valor, tipo, categoria)
CREATE TABLE IF NOT EXISTS public.tb_financas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'despesa' CHECK (tipo IN ('receita', 'despesa')),
  categoria TEXT,
  data_lancamento DATE,
  metodo_pagamento TEXT
);

COMMENT ON TABLE public.tb_financas IS 'Finanças – receitas e despesas';

-- 3) Lista de Compras (categorias: Mantimentos, Higiene/limpeza, Feira, Carnes)
CREATE TABLE IF NOT EXISTS public.tb_lista_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  item TEXT NOT NULL DEFAULT '',
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  unidade_medida TEXT,
  comprado BOOLEAN NOT NULL DEFAULT false,
  categoria TEXT NOT NULL DEFAULT 'Mantimentos' CHECK (categoria IN ('Mantimentos', 'Higiene / limpeza', 'Feira', 'Carnes'))
);

COMMENT ON TABLE public.tb_lista_compras IS 'Lista de Compras – categorias: Mantimentos, Higiene/limpeza, Feira, Carnes';

-- 4) Saúde Familiar (LGPD – dados sensíveis)
CREATE TABLE IF NOT EXISTS public.tb_saude_familiar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  membro_familia TEXT NOT NULL DEFAULT '',
  tipo_registro TEXT NOT NULL DEFAULT '' CHECK (tipo_registro IN ('Vacina', 'Exame', 'Consulta', 'Medicamento')),
  detalhes TEXT DEFAULT '',
  data_evento DATE,
  anexo_url TEXT
);

COMMENT ON TABLE public.tb_saude_familiar IS 'Saúde Familiar – Vacina, Exame, Consulta, Medicamento';

-- Índices opcionais (melhoram listagens e filtros)
CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_created_at ON public.tb_despesas_fixas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_status ON public.tb_despesas_fixas (status);
CREATE INDEX IF NOT EXISTS idx_tb_notas_created_at ON public.tb_notas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_notas_usuario_id ON public.tb_notas (usuario_id) WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tb_financas_created_at ON public.tb_financas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_financas_tipo ON public.tb_financas (tipo);
CREATE INDEX IF NOT EXISTS idx_tb_financas_data_lancamento ON public.tb_financas (data_lancamento) WHERE data_lancamento IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tb_lista_compras_categoria ON public.tb_lista_compras (categoria);
CREATE INDEX IF NOT EXISTS idx_tb_lista_compras_comprado ON public.tb_lista_compras (comprado);

CREATE INDEX IF NOT EXISTS idx_tb_saude_familiar_membro ON public.tb_saude_familiar (membro_familia);
CREATE INDEX IF NOT EXISTS idx_tb_saude_familiar_tipo ON public.tb_saude_familiar (tipo_registro);
CREATE INDEX IF NOT EXISTS idx_tb_saude_familiar_data_evento ON public.tb_saude_familiar (data_evento) WHERE data_evento IS NOT NULL;
