-- Super App - estado atual do banco (Supabase).
-- Qualquer alteracao de estrutura: edite este arquivo e execute no SQL Editor do Supabase.

-- 1) Despesas fixas (Bloco de Notas)
CREATE TABLE IF NOT EXISTS public.tb_despesas_fixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pago', 'pendente'))
);
COMMENT ON TABLE public.tb_despesas_fixas IS 'Despesas fixas - descricao, valor, pago/pendente';

CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_created_at ON public.tb_despesas_fixas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_status ON public.tb_despesas_fixas (status);

-- 2) Financas
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
COMMENT ON TABLE public.tb_financas IS 'Financas - receitas e despesas';

CREATE INDEX IF NOT EXISTS idx_tb_financas_created_at ON public.tb_financas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_financas_tipo ON public.tb_financas (tipo);
CREATE INDEX IF NOT EXISTS idx_tb_financas_data_lancamento ON public.tb_financas (data_lancamento) WHERE data_lancamento IS NOT NULL;

-- 3) Calendario
CREATE TABLE IF NOT EXISTS public.tb_calendario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  category TEXT DEFAULT '',
  telegram_sent BOOLEAN NOT NULL DEFAULT false,
  telegram_sent_at TIMESTAMPTZ
);
COMMENT ON TABLE public.tb_calendario IS 'Calendario do SUPERAPP com suporte a envio de lembrete no Telegram';

ALTER TABLE public.tb_calendario ADD COLUMN IF NOT EXISTS telegram_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tb_calendario ADD COLUMN IF NOT EXISTS telegram_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tb_calendario_date ON public.tb_calendario (date);
CREATE INDEX IF NOT EXISTS idx_tb_calendario_telegram_sent ON public.tb_calendario (telegram_sent);

CREATE OR REPLACE FUNCTION public.reset_telegram_alert_flags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'tb_calendario' THEN
    IF NEW.title IS DISTINCT FROM OLD.title
      OR NEW.date IS DISTINCT FROM OLD.date
      OR NEW.start_time IS DISTINCT FROM OLD.start_time
      OR NEW.end_time IS DISTINCT FROM OLD.end_time
      OR NEW.category IS DISTINCT FROM OLD.category THEN
      NEW.telegram_sent := false;
      NEW.telegram_sent_at := null;
    END IF;
  ELSIF TG_TABLE_NAME = 'tb_saude_familiar' THEN
    IF NEW.membro_familia IS DISTINCT FROM OLD.membro_familia
      OR NEW.tipo_registro IS DISTINCT FROM OLD.tipo_registro
      OR NEW.detalhes IS DISTINCT FROM OLD.detalhes
      OR NEW.data_evento IS DISTINCT FROM OLD.data_evento
      OR NEW.hora_evento IS DISTINCT FROM OLD.hora_evento
      OR NEW.anexo_url IS DISTINCT FROM OLD.anexo_url THEN
      NEW.telegram_sent := false;
      NEW.telegram_sent_at := null;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tb_calendario_reset_telegram_alert_flags ON public.tb_calendario;
CREATE TRIGGER trg_tb_calendario_reset_telegram_alert_flags
BEFORE UPDATE ON public.tb_calendario
FOR EACH ROW
EXECUTE FUNCTION public.reset_telegram_alert_flags();

-- 4) Lista de Compras (categoria: Mantimentos, Higiene / limpeza, Feira, Carnes)
CREATE TABLE IF NOT EXISTS public.tb_lista_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  item TEXT NOT NULL DEFAULT '',
  quantidade INTEGER NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  unidade_medida TEXT,
  comprado BOOLEAN NOT NULL DEFAULT false,
  categoria TEXT NOT NULL DEFAULT 'Mantimentos' CHECK (categoria IN ('Mantimentos', 'Higiene / limpeza', 'Feira', 'Carnes'))
);
COMMENT ON TABLE public.tb_lista_compras IS 'Lista de Compras - categorias: Mantimentos, Higiene/limpeza, Feira, Carnes';

CREATE INDEX IF NOT EXISTS idx_tb_lista_compras_categoria ON public.tb_lista_compras (categoria);
CREATE INDEX IF NOT EXISTS idx_tb_lista_compras_comprado ON public.tb_lista_compras (comprado);

-- 5) Saude familiar (LGPD - dados sensiveis)
CREATE TABLE IF NOT EXISTS public.tb_saude_familiar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  membro_familia TEXT NOT NULL DEFAULT '',
  tipo_registro TEXT NOT NULL DEFAULT '' CHECK (tipo_registro IN ('Vacina', 'Exame', 'Consulta', 'Medicamento')),
  detalhes TEXT DEFAULT '',
  data_evento DATE,
  hora_evento TIME,
  telegram_sent BOOLEAN NOT NULL DEFAULT false,
  telegram_sent_at TIMESTAMPTZ,
  anexo_url TEXT
);
COMMENT ON TABLE public.tb_saude_familiar IS 'Saude Familiar - Vacina, Exame, Consulta, Medicamento';

ALTER TABLE public.tb_saude_familiar ADD COLUMN IF NOT EXISTS hora_evento TIME;
ALTER TABLE public.tb_saude_familiar ADD COLUMN IF NOT EXISTS telegram_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tb_saude_familiar ADD COLUMN IF NOT EXISTS telegram_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tb_saude_familiar_membro ON public.tb_saude_familiar (membro_familia);
CREATE INDEX IF NOT EXISTS idx_tb_saude_familiar_tipo ON public.tb_saude_familiar (tipo_registro);
CREATE INDEX IF NOT EXISTS idx_tb_saude_familiar_data_evento ON public.tb_saude_familiar (data_evento) WHERE data_evento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tb_saude_familiar_telegram_sent ON public.tb_saude_familiar (telegram_sent);

DROP TRIGGER IF EXISTS trg_tb_saude_familiar_reset_telegram_alert_flags ON public.tb_saude_familiar;
CREATE TRIGGER trg_tb_saude_familiar_reset_telegram_alert_flags
BEFORE UPDATE ON public.tb_saude_familiar
FOR EACH ROW
EXECUTE FUNCTION public.reset_telegram_alert_flags();

-- 6) Fluxograma (projetos: grafo em JSONB)
CREATE TABLE IF NOT EXISTS public.tb_fluxograma_projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  nome TEXT NOT NULL DEFAULT 'Novo Fluxograma',
  dados JSONB NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE public.tb_fluxograma_projetos IS 'Fluxograma SUPERAPP - nos, conexoes e metadados (JSON em dados)';

CREATE INDEX IF NOT EXISTS idx_tb_fluxograma_projetos_updated ON public.tb_fluxograma_projetos (updated_at DESC);

-- Se usar RLS, crie politicas para o papel que a API usa (ex.: anon via SUPABASE_ANON_KEY no Vercel).
-- Exemplo: permitir tudo para anon (ajuste conforme sua politica de seguranca):
-- ALTER TABLE public.tb_fluxograma_projetos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "fluxograma_anon_all" ON public.tb_fluxograma_projetos FOR ALL TO anon USING (true) WITH CHECK (true);
