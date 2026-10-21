-- Rollback AGRESSIVO do extend/backfill que inundou contas fixas.
-- NAO mexe em parcelas (parcela_atual e parcela_total preenchidos).
--
-- O que faz:
-- 1) Apaga contas fixas (nao parcela) com mes < 2026-01.
-- 2) No mesmo mes + mesmo usuario + mesma descricao normalizada,
--    mantem so o registro mais antigo (min id). Isso pega "Cartao santander"
--    repetido com serie_id diferentes e valores diferentes no mesmo mes.
--
-- Rode o PREVIEW antes. Depois atualize a tela (hard refresh).

-- ========== PREVIEW ==========
-- with base as (
--   select
--     id,
--     user_id,
--     descricao,
--     serie_id,
--     valor,
--     date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as mes,
--     lower(trim(regexp_replace(
--       translate(
--         coalesce(descricao, ''),
--         'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
--         'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
--       ),
--       '\s+', ' ', 'g'
--     ))) as descricao_norm
--   from public.tb_despesas_fixas
--   where conta_fixa is true
--     and (parcela_atual is null or parcela_total is null)
-- )
-- select
--   count(*) filter (where mes < date '2026-01-01') as apagar_antes_2026,
--   count(*) filter (
--     where mes >= date '2026-01-01'
--       and id <> (
--         min(id) over (partition by user_id, descricao_norm, mes)
--       )
--   ) as apagar_duplicatas_por_nome_mes,
--   count(*) filter (where mes >= date '2026-01-01') as total_a_partir_2026
-- from base;

begin;

-- 1) Lixo historico (2017 etc.)
delete from public.tb_despesas_fixas d
where d.conta_fixa is true
  and (d.parcela_atual is null or d.parcela_total is null)
  and date_trunc('month', d.created_at at time zone 'America/Sao_Paulo')::date < date '2026-01-01';

-- 2) Duplicatas por usuario + nome + mes (independente de serie_id/valor)
delete from public.tb_despesas_fixas d
using (
  select
    id,
    row_number() over (
      partition by
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
        ))),
        date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date
      order by id asc
    ) as rn
  from public.tb_despesas_fixas
  where conta_fixa is true
    and (parcela_atual is null or parcela_total is null)
    and date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date >= date '2026-01-01'
) x
where d.id = x.id
  and x.rn > 1;

commit;

-- ========== CONFERENCIA (ex.: outubro/2026) ==========
-- select descricao, valor, serie_id, id
-- from public.tb_despesas_fixas
-- where conta_fixa is true
--   and (parcela_atual is null or parcela_total is null)
--   and date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date = date '2026-10-01'
-- order by descricao, id;
--
-- select count(*) as pendentes_out_2026
-- from public.tb_despesas_fixas
-- where conta_fixa is true
--   and (parcela_atual is null or parcela_total is null)
--   and coalesce(status, 'pendente') = 'pendente'
--   and date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date = date '2026-10-01';
