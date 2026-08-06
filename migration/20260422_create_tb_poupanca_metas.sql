-- Metas da poupanca (mantem historico; apenas uma ativa por vez)
create table if not exists public.tb_poupanca_metas (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  nome_meta text not null,
  valor_meta numeric(12,2) not null,
  data_inicio date not null default current_date,
  ativa boolean not null default true
);

create index if not exists idx_tb_poupanca_metas_ativa on public.tb_poupanca_metas (ativa);
create index if not exists idx_tb_poupanca_metas_created_at on public.tb_poupanca_metas (created_at desc);
