import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { TABELAS_NUTRICIONAIS } from '../../features/saude/data/tabelasNutricionais.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resetMigration = fs.readFileSync(path.join(root, 'migration/20260926_reset_modulo_saude.sql'), 'utf8');
const resetRollback = fs.readFileSync(path.join(root, 'migration/rollback/20260926_rollback_reset_modulo_saude.sql'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'scripts/seed-saude-tabela-nutricional.sql'), 'utf8');
const dietsSeed = fs.readFileSync(path.join(root, 'scripts/seed-saude-dietas.sql'), 'utf8');

function parseSqlText(value) {
  return value.replaceAll("''", "'");
}

function parseSeedRows(sql) {
  const tuple = /^\s*\((\d+), '((?:''|[^'])*)', '((?:''|[^'])*)', '((?:''|[^'])*)', '((?:''|[^'])*)'\),?$/gm;
  return [...sql.matchAll(tuple)].map((match) => ({
    id: Number(match[1]),
    categoria: parseSqlText(match[2]),
    protocolo: parseSqlText(match[3]),
    item: parseSqlText(match[4]),
    porcao: parseSqlText(match[5]),
  }));
}

describe('SQL do módulo Saúde', () => {
  it('reset unificado dropa legado, recria tabelas, RLS e agua ligada ao perfil de saude', () => {
    expect(resetMigration).toContain("values ('saude', 'Saude', false)");
    expect(resetMigration).toContain('drop table if exists public.tb_saude_agua_perfis cascade');
    expect(resetMigration).toContain('drop table if exists public.tb_saude_tabela_nutricional cascade');
    expect(resetMigration).not.toContain('create table public.tb_saude_tabela_nutricional');
    expect(resetMigration).toContain('create table public.tb_saude_perfis');
    expect(resetMigration).toContain('create table public.tb_saude_perfil_medidas');
    expect(resetMigration).toContain('create table public.tb_saude_dietas');
    expect(resetMigration).toContain('create table public.tb_saude_agua_metas');
    expect(resetMigration).toContain('create table public.tb_saude_agua_logs');
    expect(resetMigration).toContain('generated always as');
    expect(resetMigration).toContain('registrar_saude_perfil_medidas');
    expect(resetMigration).toContain('after insert or update on public.tb_saude_perfis');
    expect(resetMigration).toContain('references public.tb_saude_perfis (id, created_by)');
    expect(resetMigration).toContain('force row level security');
    expect(resetMigration).toContain('created_by = auth.uid()');
    expect(resetMigration).not.toContain('create table public.tb_saude_agua_perfis');
    expect(resetMigration.trim().endsWith('commit;')).toBe(true);

    expect(resetRollback).toContain('drop table if exists public.tb_saude_agua_logs');
    expect(resetRollback).toContain('drop function if exists public.registrar_saude_perfil_medidas()');
  });

  it('mantém o seed legado da tabela nutricional (script opcional; tabela nao existe apos o reset)', () => {
    const rows = parseSeedRows(seed);

    expect(seed).toContain('on conflict (source_order) do update');
    expect(rows).toHaveLength(115);
    expect(rows).toEqual(TABELAS_NUTRICIONAIS);
  });

  it('mantém seed de dietas idempotente após o reset', () => {
    expect(dietsSeed).toContain("'detox-7-dias-perder-peso'");
    expect(dietsSeed).toContain('on conflict (slug) do update');
    expect(dietsSeed).toContain('$dias$::jsonb');
  });
});
