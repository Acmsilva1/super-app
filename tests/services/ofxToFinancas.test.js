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
  shouldImportOfxAsGastoVariado,
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

  it('importa só débito OFX ou PIX enviado; demais linhas ignoradas', () => {
    expect(shouldImportOfxAsGastoVariado(-10, 'DEBIT')).toBe(true);
    expect(shouldImportOfxAsGastoVariado(100, 'CREDIT')).toBe(false);
    expect(shouldImportOfxAsGastoVariado(-50, 'DEBIT', 'PIX ENVIADO')).toBe(true);
    expect(shouldImportOfxAsGastoVariado(-50, 'OTHER', 'PIX ENVIADO')).toBe(true);
    expect(shouldImportOfxAsGastoVariado(-50, 'XFER', 'TRANSFERENCIA')).toBe(false);
    expect(shouldImportOfxAsGastoVariado(-50, 'OTHER', 'COMPRA CARTAO')).toBe(false);
    expect(shouldImportOfxAsGastoVariado(50, 'CREDIT', 'PIX RECEBIDO')).toBe(false);

    const { lancamentos, erros_parse, account_key, ignorados_credito } = parseOfxToLancamentos(sampleOfx);
    expect(erros_parse.filter((e) => e.indice === -1)).toHaveLength(0);
    expect(account_key).toBe('001:12345-6');
    expect(lancamentos).toHaveLength(1);
    expect(lancamentos[0].tipo).toBe('despesa');
    expect(lancamentos[0].tipo_registro).toBe('gasto_variado');
    expect(lancamentos[0].valor).toBe(150.5);
    expect(ignorados_credito).toBe(1);
  });

  it('marca duplicados existentes no resumo', () => {
    const { lancamentos } = parseOfxToLancamentos(sampleOfx);
    const annotated = annotateLancamentosExistencia(lancamentos, new Set([lancamentos[0].ofx_uid]));
    const resumo = resumoImportacaoOfx(annotated);
    expect(resumo.novos).toBe(0);
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
