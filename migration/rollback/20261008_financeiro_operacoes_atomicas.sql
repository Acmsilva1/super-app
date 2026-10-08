begin;
drop function if exists public.financeiro_realocar_registro(uuid,text,text,text,jsonb);
drop function if exists public.financeiro_criar_meta(uuid,jsonb);
commit;
