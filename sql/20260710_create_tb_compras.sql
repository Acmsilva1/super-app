-- Auditoria manual de itens adquiridos (modulo financeiro - aba Compras)
-- Escopo isolado: nao mistura com tb_financas / despesas

create table if not exists public.tb_compras (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  descricao text not null,
  valor numeric(12,2) not null default 0,
  metodo_pagamento text not null default 'a_vista',
  data_lancamento date not null default current_date
);

create index if not exists idx_tb_compras_data_lancamento
  on public.tb_compras (data_lancamento desc);

create index if not exists idx_tb_compras_created_at
  on public.tb_compras (created_at desc);

comment on table public.tb_compras is
  'Auditoria manual de itens adquiridos (modulo financeiro - aba Compras)';
comment on column public.tb_compras.metodo_pagamento is
  'Forma de pagamento: a_vista ou parcelado';
