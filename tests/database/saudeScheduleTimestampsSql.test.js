import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('mantém datas independentes, preserva configuração na reaplicação e permite rollback', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table tb_saude_alertas_agenda(
      perfil_id integer primary key, agua_ativo boolean default true, agua_intervalo_horas integer default 3,
      agua_inicio text default '07:30', agua_fim text default '22:30', dieta_ativa boolean default true,
      dieta_id integer, dieta_horarios jsonb default '[]', updated_at timestamptz default now());
      insert into tb_saude_alertas_agenda(perfil_id,updated_at) values(1,'2026-01-01T00:00:00Z');`);
    const sql = await readFile(new URL('../../migration/20261010_fix_saude_alertas_section_timestamps.sql',import.meta.url),'utf8');
    await db.exec(sql);
    const read = async () => (await db.query('select agua_updated_at::text,dieta_updated_at::text,updated_at::text from tb_saude_alertas_agenda')).rows[0];
    const initial = await read();
    await db.exec("update tb_saude_alertas_agenda set agua_inicio='08:00'");
    const water = await read();
    expect(water.agua_updated_at).not.toBe(initial.agua_updated_at);
    expect(water.dieta_updated_at).toBe(initial.dieta_updated_at);
    await db.exec("update tb_saude_alertas_agenda set dieta_horarios='[{\"tipo\":\"jantar\",\"horario\":\"19:00\"}]'");
    const diet = await read();
    expect(diet.dieta_updated_at).not.toBe(water.dieta_updated_at);
    expect(diet.agua_updated_at).toBe(water.agua_updated_at);
    await db.exec("update tb_saude_alertas_agenda set agua_inicio='08:00'");
    expect(await read()).toEqual(diet);
    await db.exec(sql);
    expect(await read()).toEqual(diet);
    await db.exec(await readFile(new URL('../../migration/rollback/20261010_saude_alertas_section_timestamps.sql',import.meta.url),'utf8'));
    expect((await db.query('select agua_inicio from tb_saude_alertas_agenda')).rows[0].agua_inicio).toBe('08:00');
  } finally { await db.close(); }
},20000);
