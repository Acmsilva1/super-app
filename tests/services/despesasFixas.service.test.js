import { describe, expect, it } from 'vitest';

import {
  calcularSoma,
  calcularSomasPorStatus,
  payloadInsert,
  payloadUpdate,
} from '../../features/despesas_fixas/service/despesasFixasService.js';

describe('despesasFixasService', () => {
  it('monta payload de insert com arredondamento', () => {
    const out = payloadInsert(' Internet ', 99.999, 'pago');
    expect(out).toEqual({
      descricao: 'Internet',
      valor: 100,
      status: 'pago',
    });
  });

  it('monta payload de update parcial', () => {
    const out = payloadUpdate(undefined, 10.555, 'x');
    expect(out.valor).toBe(10.56);
    expect(out.status).toBe('pendente');
  });

  it('calcula somas totais e por status', () => {
    const rows = [
      { valor: 50, status: 'pago' },
      { valor: 20, status: 'pendente' },
    ];
    expect(calcularSoma(rows)).toBe(70);
    expect(calcularSomasPorStatus(rows)).toEqual({
      soma: 70,
      somaPago: 50,
      somaPendente: 20,
    });
  });
});
