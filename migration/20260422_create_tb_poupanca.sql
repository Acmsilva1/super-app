-- Tabela para registros de poupanca do modulo financeiro unificado
create table if not exists public.tb_poupanca (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  descricao text not null,
  valor numeric(12,2) not null default 0,
  data_lancamento date not null default current_date
);

create index if not exists idx_tb_poupanca_data_lancamento on public.tb_poupanca (data_lancamento desc);
create index if not exists idx_tb_poupanca_created_at on public.tb_poupanca (created_at desc);
