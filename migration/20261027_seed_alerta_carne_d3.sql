-- Configura alerta financeiro do carnê (D-3 com base em vencimentoIso da parcela).
-- 1º boleto Carro Juliana: vencimento 19/11/2026 → elegível a partir de 16/11/2026.
-- Pré-requisito: 20261027_financeiro_carne_alerta.sql
begin;
insert into public.tb_financeiro_alertas (id, user_id, nome, tipo, mensagem, cron, horarios, timezone, ativo)
select
  'b937a201-0000-4000-8000-000000000010'::uuid,
  'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid,
  'Resumo · Carnê / boleto',
  'carne',
  '',
  '0 9 * * *',
  '["09:00"]'::jsonb,
  'America/Sao_Paulo',
  true
where exists (select 1 from auth.users where id = 'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid)
  and not exists (
    select 1 from public.tb_financeiro_alertas existing
    where existing.id = 'b937a201-0000-4000-8000-000000000010'::uuid
       or (existing.user_id = 'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid and existing.tipo = 'carne')
  );
commit;
