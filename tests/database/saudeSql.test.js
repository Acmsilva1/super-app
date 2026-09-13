import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { TABELAS_NUTRICIONAIS } from '../../features/saude/data/tabelasNutricionais.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(path.join(root, 'migration/20260913_create_saude_module.sql'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'scripts/seed-saude-tabela-nutricional.sql'), 'utf8');

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
  it('cria o módulo, a tabela e policies RLS granulares', () => {
    expect(migration).toContain("values ('saude', 'Saude', false)");
    expect(migration).toContain('create table if not exists public.tb_saude_tabela_nutricional');
    expect(migration).toContain('alter table public.tb_saude_tabela_nutricional enable row level security');
    expect(migration).toContain('alter table public.tb_saude_tabela_nutricional force row level security');
    expect(migration.match(/create policy tb_saude_tabela_nutricional_admin_/g)).toHaveLength(4);
    expect(migration.trim().endsWith('-- commit;')).toBe(true);
  });

  it('mantém o seed idempotente e fiel aos 115 itens do Excel', () => {
    const rows = parseSeedRows(seed);

    expect(seed).toContain('on conflict (source_order) do update');
    expect(rows).toHaveLength(115);
    expect(rows).toEqual(TABELAS_NUTRICIONAIS);
  });
});
