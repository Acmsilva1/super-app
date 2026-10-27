-- Remove rastro do carnê mock "Moto André" (nunca foi boleto real).
-- Rodar após 20261027_financeiro_carne_alerta.sql se a tabela já existir.
begin;
delete from public.tb_financeiro_carne_pago
where carne_id in ('moto-andre', 'moto_andre', 'Moto André');
commit;
