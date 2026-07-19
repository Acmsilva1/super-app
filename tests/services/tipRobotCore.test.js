import { describe, expect, it } from 'vitest';

import { getPrimeiroNome } from '../../components/robo/mascoteDicas.js';
import {
  normalizeMessages,
  pickNextTip,
  sameList,
} from '../../components/robo/tipRobotCore.js';
import { DICAS_FINANCEIRO } from '../../components/robo/dicasFinanceiro.js';

describe('tipRobotCore / dicas financeiro', () => {
  it('normaliza e remove vazias/duplicadas', () => {
    expect(normalizeMessages(['  a ', '', 'a', 'b', null, 1])).toEqual(['a', 'b']);
  });

  it('sameList compara conteudo', () => {
    expect(sameList(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameList(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('pickNextTip evita repetir imediatamente com 2+ itens', () => {
    const pool = ['um', 'dois', 'tres'];
    for (let i = 0; i < 30; i += 1) {
      const next = pickNextTip(pool, 'um');
      expect(next).not.toBe('um');
      expect(pool).toContain(next);
    }
  });

  it('pickNextTip pode repetir com uma mensagem', () => {
    expect(pickNextTip(['unica'], 'unica')).toBe('unica');
  });

  it('getPrimeiroNome usa so o primeiro token', () => {
    expect(getPrimeiroNome('André Silva')).toBe('André');
    expect(getPrimeiroNome('')).toBe('');
  });

  it('exporta dicas de financas nao vazias', () => {
    expect(DICAS_FINANCEIRO.length).toBeGreaterThan(3);
    expect(DICAS_FINANCEIRO.every((m) => typeof m === 'string' && m.trim())).toBe(true);
  });
});
