import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(path.join(root, 'migration/20260923_create_missoes_treino_logs.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'migration/rollback/20260923_drop_missoes_treino_logs.sql'), 'utf8');

describe('migration dos logs de check-in', () => {
  it('cria historico com perfil, treino, duracao e data', () => {
    expect(migration).toContain('create table if not exists public.tb_missoes_treino_logs');
    expect(migration).toContain('perfil_id bigint not null');
    expect(migration).toContain('missao_id uuid references public.tb_missoes_treino(id)');
    expect(migration).not.toContain('missao_id bigint references public.tb_missoes_treino(id)');
    expect(migration).toContain('treino_nome text not null');
    expect(migration).toContain('duracao_segundos integer not null');
    expect(migration).toContain('finalizado_em timestamptz not null default now()');
  });

  it('protege a tabela com RLS e fornece rollback explicito', () => {
    expect(migration).toContain('enable row level security');
    expect(migration).toContain('force row level security');
    expect(migration).toContain('public.is_app_admin()');
    expect(rollback).toContain('drop table if exists public.tb_missoes_treino_logs');
  });

  it('impede registros corrompidos e preserva o historico ao excluir um treino', () => {
    expect(migration).toContain('on delete cascade');
    expect(migration).toContain('on delete set null');
    expect(migration).toContain('check (char_length(trim(treino_nome)) between 1 and 160)');
    expect(migration).toContain('check (duracao_segundos between 1 and 604800)');
    expect(migration).toContain('idx_missoes_treino_logs_perfil_finalizado');
  });

  it('concede somente leitura, inclusao e exclusao para usuarios autenticados', () => {
    expect(migration).toContain('grant select, insert, delete on public.tb_missoes_treino_logs to authenticated');
    expect(migration).not.toMatch(/grant[^;]*update[^;]*tb_missoes_treino_logs/i);
    expect((migration.match(/public\.is_app_admin\(\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it('permanece em SQL puro, sem escapes de Markdown ou espacos invisiveis', () => {
    expect(migration).not.toContain('\\_');
    expect(migration).not.toContain('\\--');
    expect(migration).not.toContain('\u00a0');
    expect(migration).toContain("to_regprocedure('public.is_app_admin()')");
  });
});
