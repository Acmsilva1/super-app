import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(path.join(root, 'migration/20260923_create_saude_consumo_agua.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'migration/rollback/20260923_drop_saude_consumo_agua.sql'), 'utf8');
const profilesMigration = fs.readFileSync(path.join(root, 'migration/20260923_add_perfis_saude_consumo_agua.sql'), 'utf8');

describe('migration de consumo de agua', () => {
  it('cria configuracao e log diario isolados por usuario', () => {
    expect(migration).toContain('create table if not exists public.tb_saude_agua_metas');
    expect(migration).toContain('create table if not exists public.tb_saude_agua_logs');
    expect(migration).toContain('unique (created_by, data_local)');
    expect(migration).toContain('check (realizado_doses between 0 and meta_doses)');
    expect(migration).toContain('created_by = auth.uid()');
  });

  it('mantem rollback explicito das duas tabelas', () => {
    expect(rollback).toContain('drop table if exists public.tb_saude_agua_logs');
    expect(rollback).toContain('drop table if exists public.tb_saude_agua_metas');
  });

  it('adiciona perfis e isola metas e dias por pessoa sem perder dados existentes', () => {
    expect(profilesMigration).toContain('create table if not exists public.tb_saude_agua_perfis');
    expect(profilesMigration).toContain("select usuarios.created_by, 'Meu perfil'");
    expect(profilesMigration).toContain('primary key (created_by, perfil_id)');
    expect(profilesMigration).toContain('unique (created_by, perfil_id, data_local)');
    expect(profilesMigration).toContain('foreign key (perfil_id, created_by)');
    expect(profilesMigration).toContain('created_by = auth.uid()');
  });
});
