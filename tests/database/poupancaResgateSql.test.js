import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = fs.readFileSync(path.join(root, 'migration/20260925_add_resgate_poupanca.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'migration/rollback/20260925_remove_resgate_poupanca.sql'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

describe('resgate da poupanca', () => {
  it('adiciona motivo e registra o movimento como valor negativo', () => {
    expect(migration).toContain('add column if not exists motivo_resgate text');
    expect(migration).toContain("p_user_id, 'Resgate', -v_valor, v_motivo");
    expect(migration).toContain('saldo insuficiente para este resgate');
  });

  it('serializa resgates e restringe a funcao ao backend', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('security definer');
    expect(migration).toContain('grant execute on function public.resgatar_poupanca(uuid, numeric, text, date) to service_role');
    expect(migration).toContain('revoke all on function public.resgatar_poupanca(uuid, numeric, text, date) from public, anon, authenticated');
  });

  it('fornece rollback e mostra motivo no historico da interface', () => {
    expect(rollback).toContain('drop function if exists public.resgatar_poupanca');
    expect(rollback).toContain('drop column if exists motivo_resgate');
    expect(ui).toContain('data-action="poupanca-open-resgate-modal"');
    expect(ui).toContain('Motivo: ${escapeHtml(motivoResgate');
  });
});
