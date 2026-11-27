-- Lista de compras: novas categorias e posição persistida entre dispositivos.
-- Categorias: Limpeza, Higiene, Feira, Essencial, Gelados (categoria NULL = sem alocação).
-- Idempotente: seguro reexecutar no SQL Editor após falha parcial.
--
-- Se a constraint já estiver em estado ruim e quiser só destravar antes desta migration:
--   alter table public.tb_lista_compras drop constraint if exists tb_lista_compras_categoria_check;

begin;

-- 1) Remover check ANTES de qualquer UPDATE (constraint antiga pode rejeitar Essencial/Gelados).
alter table public.tb_lista_compras
  drop constraint if exists tb_lista_compras_categoria_check;

-- 2) Coluna de ordem visual.
alter table public.tb_lista_compras
  add column if not exists posicao integer;

-- 3) Normalizar categorias (trim + legado → conjunto atual).
update public.tb_lista_compras
set categoria = case
  when nullif(btrim(categoria), '') is null then null
  when btrim(categoria) in ('Limpeza', 'Higiene', 'Feira', 'Essencial', 'Gelados') then btrim(categoria)
  when btrim(categoria) in ('Higiene / limpeza', 'Higiene/limpeza', 'Limpeza / higiene') then 'Higiene'
  when btrim(categoria) in ('Mantimentos', 'Carnes', 'Mercado') then 'Essencial'
  else 'Essencial'
end
where categoria is distinct from case
  when nullif(btrim(categoria), '') is null then null
  when btrim(categoria) in ('Limpeza', 'Higiene', 'Feira', 'Essencial', 'Gelados') then btrim(categoria)
  when btrim(categoria) in ('Higiene / limpeza', 'Higiene/limpeza', 'Limpeza / higiene') then 'Higiene'
  when btrim(categoria) in ('Mantimentos', 'Carnes', 'Mercado') then 'Essencial'
  else 'Essencial'
end;

-- 4) Pré-checagem: falha clara se ainda houver valores fora do conjunto.
do $$
declare
  invalidas text;
begin
  select string_agg(categoria, ', ' order by categoria)
  into invalidas
  from (
    select distinct categoria
    from public.tb_lista_compras
    where categoria is not null
      and categoria not in ('Limpeza', 'Higiene', 'Feira', 'Essencial', 'Gelados')
  ) s;

  if invalidas is not null then
    raise exception
      'tb_lista_compras: categorias inválidas restantes (normalize antes do check): %',
      invalidas;
  end if;
end $$;

-- 5) Backfill de posição por usuário (ordem visual anterior: categoria + created_at).
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by
        coalesce(categoria, '') asc,
        created_at desc nulls last,
        id asc
    ) as nova_posicao
  from public.tb_lista_compras
  where posicao is null
)
update public.tb_lista_compras as t
set posicao = ranked.nova_posicao
from ranked
where t.id = ranked.id;

alter table public.tb_lista_compras
  alter column posicao set default 0;

update public.tb_lista_compras set posicao = 0 where posicao is null;

alter table public.tb_lista_compras
  alter column posicao set not null;

-- 6) Recriar check com o conjunto atual.
alter table public.tb_lista_compras
  add constraint tb_lista_compras_categoria_check
  check (
    categoria is null
    or categoria in ('Limpeza', 'Higiene', 'Feira', 'Essencial', 'Gelados')
  );

create index if not exists idx_tb_lista_compras_user_posicao
  on public.tb_lista_compras (user_id, posicao, id);

comment on column public.tb_lista_compras.posicao is
  'Ordem visual persistida da lista; menor valor aparece primeiro.';
comment on column public.tb_lista_compras.categoria is
  'Categoria opcional: Limpeza, Higiene, Feira, Essencial ou Gelados.';

commit;
