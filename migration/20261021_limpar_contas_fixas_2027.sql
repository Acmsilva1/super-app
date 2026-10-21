-- Limpa TODAS as contas fixas de 2027 (jan..dez).
-- NAO mexe em:
--   - parcelas (parcela_atual/parcela_total preenchidos)
--   - nov/dez 2026 (voce ja ajustou na unha)
--
-- Preview:
--   select
--     to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
--     count(*) as qtd,
--     string_agg(distinct descricao, ' | ' order by descricao) as nomes
--   from public.tb_despesas_fixas
--   where conta_fixa is true
--     and (parcela_atual is null or parcela_total is null)
--     and date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date
--         between date '2027-01-01' and date '2027-12-01'
--   group by 1
--   order by 1;

begin;

delete from public.tb_despesas_fixas d
where d.conta_fixa is true
  and (d.parcela_atual is null or d.parcela_total is null)
  and date_trunc('month', d.created_at at time zone 'America/Sao_Paulo')::date
      between date '2027-01-01' and date '2027-12-01';

commit;

-- Conferencia (deve voltar 0 linhas de conta fixa em 2027):
--   select
--     to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
--     count(*) filter (
--       where conta_fixa is true
--         and (parcela_atual is null or parcela_total is null)
--     ) as contas_fixas,
--     count(*) filter (
--       where parcela_atual is not null and parcela_total is not null
--     ) as parcelas
--   from public.tb_despesas_fixas
--   where date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date
--         between date '2027-01-01' and date '2027-12-01'
--   group by 1
--   order by 1;
