import { describe, expect, it } from 'vitest';
import { calcularImc, classificarImc } from '../../features/saude/service/perfilSaudeService.js';

describe('perfilSaudeService', () => {
  it('calcula o IMC com peso em kg e altura em cm', () => {
    expect(calcularImc(80, 180)).toBe(24.69);
  });

  it('classifica o IMC adulto e rejeita valores invalidos', () => {
    expect(classificarImc(24.69)).toBe('Peso adequado');
    expect(classificarImc(31)).toBe('Obesidade grau I');
    expect(calcularImc(80, 0)).toBeNull();
  });
});
