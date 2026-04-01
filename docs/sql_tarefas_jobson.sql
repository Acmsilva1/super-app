-- Tabela do modulo Tarefas Jobson
create table if not exists public.tb_tarefas_jobson (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  descricao text not null,
  data date not null,
  slot_hora text not null,
  status text not null default 'pendente',
  notificado boolean not null default false,
  constraint tb_tarefas_jobson_status_chk check (status in ('pendente', 'concluida')),
  constraint tb_tarefas_jobson_slot_hora_chk check (slot_hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

create index if not exists idx_tb_tarefas_jobson_data_slot
  on public.tb_tarefas_jobson (data, slot_hora);

create index if not exists idx_tb_tarefas_jobson_status
  on public.tb_tarefas_jobson (status);

create unique index if not exists uq_tb_tarefas_jobson_data_slot
  on public.tb_tarefas_jobson (data, slot_hora);
