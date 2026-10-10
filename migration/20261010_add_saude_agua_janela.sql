-- Aplicar depois das migrations da agenda de Saúde.
begin;
alter table public.tb_saude_alertas_agenda add column if not exists agua_inicio text not null default '07:30';
alter table public.tb_saude_alertas_agenda add column if not exists agua_fim text not null default '22:30';
do $$ begin
 if not exists(select 1 from pg_constraint where conname='tb_saude_agenda_agua_janela_check' and conrelid='public.tb_saude_alertas_agenda'::regclass) then
  alter table public.tb_saude_alertas_agenda add constraint tb_saude_agenda_agua_janela_check check (
   agua_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and agua_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and agua_inicio < agua_fim
  );
 end if;
end $$;
comment on column public.tb_saude_alertas_agenda.agua_inicio is 'Início da janela diária de água no horário de Brasília';
comment on column public.tb_saude_alertas_agenda.agua_fim is 'Limite final dos avisos de água, no mesmo dia e horário de Brasília';
notify pgrst, 'reload schema';
commit;
