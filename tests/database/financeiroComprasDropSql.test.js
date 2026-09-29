import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = path.resolve('migration/20260929_drop_financeiro_compras.sql');
const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase();
const rollbackPath = path.resolve('migration/rollback/20260929_restore_financeiro_compras.sql');
const rollbackSql = fs.readFileSync(rollbackPath, 'utf8').toLowerCase();

describe('migration de remocao do modo Compras do Financeiro', () => {
  it('remove primeiro a view dependente e depois tb_compras', () => {
    const dropViewAt = sql.indexOf('drop view if exists public.vw_financeiro_compras_mensal');
    const dropTableAt = sql.indexOf('drop table if exists public.tb_compras');

    expect(dropViewAt).toBeGreaterThan(-1);
    expect(dropTableAt).toBeGreaterThan(dropViewAt);
    expect(sql).not.toContain('tb_lista_compras');
  });

  it('executa a remocao dentro de uma transacao', () => {
    expect(sql).toMatch(/\bbegin\s*;/);
    expect(sql).toMatch(/\bcommit\s*;/);
  });

  it('possui rollback estrutural sem prometer restauracao dos dados', () => {
    expect(rollbackSql).toContain('create table if not exists public.tb_compras');
    expect(rollbackSql).toContain('create or replace view public.vw_financeiro_compras_mensal');
    expect(rollbackSql).toContain('somente podem ser recuperados de backup');
  });
});
