-- Backfill de serie_id para contas fixas legadas (conta_fixa = true e serie_id nulo).
-- Agrupa por usuario + descricao normalizada (trim, lower, espacos colapsados, sem acento basico).
-- Idempotente: so atualiza linhas ainda sem serie_id.
-- Rode no SQL Editor do Supabase (ou psql) antes/apos o deploy do app.
--
-- Preview (opcional, rode antes do UPDATE):
--   select
--     user_id,
--     lower(trim(regexp_replace(
--       translate(descricao,
--         'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
--         'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
--       ),
--       '\s+', ' ', 'g'
--     ))) as descricao_norm,
--     count(*) as meses,
--     min(created_at) as primeiro,
--     max(created_at) as ultimo
--   from public.tb_despesas_fixas
--   where conta_fixa is true
--     and (serie_id is null or btrim(serie_id) = '')
--     and (parcela_atual is null or parcela_total is null)
--   group by 1, 2
--   order by 1, 2;

begin;

with alvo as (
  select
    id,
    user_id,
    lower(trim(regexp_replace(
      translate(
        coalesce(descricao, ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
      ),
      '\s+',
      ' ',
      'g'
    ))) as descricao_norm
  from public.tb_despesas_fixas
  where conta_fixa is true
    and (serie_id is null or btrim(serie_id) = '')
    and (parcela_atual is null or parcela_total is null)
    and nullif(btrim(coalesce(descricao, '')), '') is not null
),
series as (
  select
    user_id,
    descricao_norm,
    gen_random_uuid()::text as novo_serie_id
  from (
    select distinct user_id, descricao_norm
    from alvo
    where descricao_norm <> ''
  ) d
)
update public.tb_despesas_fixas d
set serie_id = s.novo_serie_id
from alvo a
join series s
  on s.user_id = a.user_id
 and s.descricao_norm = a.descricao_norm
where d.id = a.id
  and (d.serie_id is null or btrim(d.serie_id) = '');

commit;

-- Conferencia pos-backfill:
--   select
--     count(*) filter (where conta_fixa is true and (serie_id is null or btrim(serie_id) = '')) as fixas_sem_serie,
--     count(*) filter (where conta_fixa is true and serie_id is not null and btrim(serie_id) <> '') as fixas_com_serie
--   from public.tb_despesas_fixas;
