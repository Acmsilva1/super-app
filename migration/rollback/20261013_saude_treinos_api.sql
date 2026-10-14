-- Remove somente as funções novas da API; mantém os treinos e as três tabelas.
begin;
drop function if exists public.saude_manage_treinos(uuid,bigint,text,jsonb,timestamptz) restrict;
drop function if exists public.saude_treino_payload(uuid) restrict;
notify pgrst,'reload schema';
commit;
