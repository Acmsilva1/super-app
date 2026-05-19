import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  annotateLancamentosExistencia,
  buildOfxUid,
  inferTipoFromOfx,
  parseOfxDate,
  parseOfxToLancamentos,
  resumoImportacaoOfx,
} from '../../features/financeiro/service/ofxToFinancas.js';
import { payloadInsertFinanceiro } from '../../features/financeiro/service/financeiroService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleOfx = readFileSync(join(__dirname, '../fixtures/sample.ofx'), 'utf8');

describe('ofxToFinancas', () => {
  it('parseia datas OFX', () => {
    expect(parseOfxDate('20260510')).toBe('2026-05-10');
    expect(parseOfxDate('20260510120000')).toBe('2026-05-10');
  });

  it('infere tipo por valor e TRNTYPE', () => {
    expect(inferTipoFromOfx(-10, 'DEBIT')).toBe('despesa');
    expect(inferTipoFromOfx(100, 'CREDIT')).toBe('receita');
  });

  it('gera ofx_uid estável', () => {
    const uid = buildOfxUid('001:12345-6', 'txn-debit-001');
    expect(uid).toBe('001:12345-6|txn-debit-001');
    expect(buildOfxUid('x', '')).toBeNull();
  });

  it('extrai lançamentos do fixture', () => {
    const { lancamentos, erros_parse, account_key } = parseOfxToLancamentos(sampleOfx);
    expect(erros_parse.filter((e) => e.indice === -1)).toHaveLength(0);
    expect(account_key).toBe('001:12345-6');
    expect(lancamentos).toHaveLength(2);
    expect(lancamentos[0].tipo).toBe('despesa');
    expect(lancamentos[0].valor).toBe(150.5);
    expect(lancamentos[1].tipo).toBe('receita');
    expect(lancamentos[1].valor).toBe(3200);
  });

  it('marca duplicados existentes no resumo', () => {
    const { lancamentos } = parseOfxToLancamentos(sampleOfx);
    const annotated = annotateLancamentosExistencia(lancamentos, new Set([lancamentos[0].ofx_uid]));
    const resumo = resumoImportacaoOfx(annotated);
    expect(resumo.novos).toBe(1);
    expect(resumo.ja_existentes).toBe(1);
  });

  it('payloadInsertFinanceiro aceita ofx_uid', () => {
    const out = payloadInsertFinanceiro({
      tipo_registro: 'gasto_variado',
      descricao: 'Teste',
      valor: 10,
      data_lancamento: '2026-05-10',
      ofx_uid: '001:12345-6|txn-debit-001',
    });
    expect(out.error).toBeUndefined();
    expect(out.payload.ofx_uid).toBe('001:12345-6|txn-debit-001');
  });
});
