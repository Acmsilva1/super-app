import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const resetMigration = fs.readFileSync(path.join(root, 'migration/20260926_reset_modulo_saude.sql'), 'utf8');
const resetRollback = fs.readFileSync(path.join(root, 'migration/rollback/20260926_rollback_reset_modulo_saude.sql'), 'utf8');
const aguaHistoricoSeed = fs.readFileSync(path.join(root, 'scripts/seed-saude-agua-historico.sql'), 'utf8');

describe('reset do módulo Saúde (água unificada ao perfil)', () => {
  it('remove tabelas legadas incluindo perfis de água separados', () => {
    expect(resetMigration).toContain('drop table if exists public.tb_saude_agua_perfis cascade');
    expect(resetMigration).toContain('drop table if exists public.tb_saude_perfis cascade');
    expect(resetMigration).not.toContain('create table public.tb_saude_agua_perfis');
  });

  it('recria metas e logs com FK composta para tb_saude_perfis e RLS por usuário', () => {
    expect(resetMigration).toContain('create table public.tb_saude_agua_metas');
    expect(resetMigration).toContain('create table public.tb_saude_agua_logs');
    expect(resetMigration).toContain('primary key (created_by, perfil_id)');
    expect(resetMigration).toContain('unique (created_by, perfil_id, data_local)');
    expect(resetMigration).toContain('foreign key (perfil_id, created_by)');
    expect(resetMigration).toContain('references public.tb_saude_perfis (id, created_by)');
    expect(resetMigration).toContain('created_by = auth.uid()');
    expect(resetMigration).toContain('force row level security');
  });

  it('mantém rollback explícito do schema recriado', () => {
    expect(resetRollback).toContain('drop table if exists public.tb_saude_agua_logs');
    expect(resetRollback).toContain('drop table if exists public.tb_saude_agua_metas');
    expect(resetRollback).toContain('drop function if exists public.registrar_saude_perfil_medidas()');
  });

  it('seed de histórico de água cobre André e Juliana (23–25/09/2026)', () => {
    expect(aguaHistoricoSeed).toContain('tb_saude_perfis');
    expect(aguaHistoricoSeed).toContain('tb_saude_agua_metas');
    expect(aguaHistoricoSeed).toContain('tb_saude_agua_logs');
    expect(aguaHistoricoSeed).toContain("date '2026-09-25', 16, 6");
    expect(aguaHistoricoSeed).toContain("date '2026-09-25', 9, 7");
    expect(aguaHistoricoSeed).toContain("lower(trim(p.nome)) in ('andré', 'andre')");
    expect(aguaHistoricoSeed).toContain('on conflict (created_by, perfil_id, data_local)');
    expect(aguaHistoricoSeed).toContain('auth.users');
  });
});
