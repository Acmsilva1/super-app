-- Lista de compras: novas categorias e posição persistida entre dispositivos.
-- Categorias: Limpeza, Higiene, Feira, Essencial, Gelados (categoria NULL = sem alocação).
begin;

alter table public.tb_lista_compras
  add column if not exists posicao integer;

-- Preenche posição por usuário, preservando a ordem visual anterior (categoria + created_at).
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

update public.tb_lista_compras
set categoria = case
  when categoria in ('Limpeza', 'Higiene', 'Feira', 'Essencial', 'Gelados') then categoria
  when categoria = 'Higiene / limpeza' then 'Higiene'
  when categoria = 'Feira' then 'Feira'
  when categoria in ('Mantimentos', 'Carnes', 'Mercado') then 'Essencial'
  when nullif(trim(categoria), '') is null then null
  else 'Essencial'
end
where categoria is distinct from case
  when categoria in ('Limpeza', 'Higiene', 'Feira', 'Essencial', 'Gelados') then categoria
  when categoria = 'Higiene / limpeza' then 'Higiene'
  when categoria = 'Feira' then 'Feira'
  when categoria in ('Mantimentos', 'Carnes', 'Mercado') then 'Essencial'
  when nullif(trim(categoria), '') is null then null
  else 'Essencial'
end;

alter table public.tb_lista_compras
  alter column posicao set default 0;

update public.tb_lista_compras set posicao = 0 where posicao is null;

alter table public.tb_lista_compras
  alter column posicao set not null;

alter table public.tb_lista_compras
  drop constraint if exists tb_lista_compras_categoria_check;

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
