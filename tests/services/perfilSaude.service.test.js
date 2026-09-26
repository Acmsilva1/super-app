import { describe, expect, it } from 'vitest';
import { calcularImc, calcularLarguraGraficoPeso, classificarImc, criarTendenciaPeso } from '../../features/saude/service/perfilSaudeService.js';

describe('perfilSaudeService', () => {
  it('calcula o IMC com peso em kg e altura em cm', () => {
    expect(calcularImc(80, 180)).toBe(24.69);
  });

  it('classifica o IMC adulto e rejeita valores invalidos', () => {
    expect(classificarImc(24.69)).toBe('Peso adequado');
    expect(classificarImc(31)).toBe('Obesidade grau I');
    expect(calcularImc(80, 0)).toBeNull();
  });

  it('usa largura compacta no mobile para aproximar os pontos', () => {
    expect(calcularLarguraGraficoPeso(2, { mobile: true })).toBe(240);
    expect(calcularLarguraGraficoPeso(2, { mobile: false })).toBe(560);
    const mobile = criarTendenciaPeso([
      { peso_kg: 91, registrado_em: '2026-09-24T12:00:00-03:00' },
      { peso_kg: 85, registrado_em: '2026-09-25T12:00:00-03:00' },
    ], calcularLarguraGraficoPeso(2, { mobile: true }), 180, 22);
    const desktop = criarTendenciaPeso([
      { peso_kg: 91, registrado_em: '2026-09-24T12:00:00-03:00' },
      { peso_kg: 85, registrado_em: '2026-09-25T12:00:00-03:00' },
    ], calcularLarguraGraficoPeso(2, { mobile: false }), 180, 28);
    expect(mobile.pontos.at(-1).x - mobile.pontos[0].x).toBeLessThan(desktop.pontos.at(-1).x - desktop.pontos[0].x);
  });

  it('ordena o historico e calcula os pontos da tendencia de peso', () => {
    const trend = criarTendenciaPeso([
      { peso_kg: 78, registrado_em: '2026-09-20T12:00:00-03:00' },
      { peso_kg: 80, registrado_em: '2026-09-10T12:00:00-03:00' },
      { peso_kg: 77.5, registrado_em: '2026-09-25T12:00:00-03:00' },
    ]);
    expect(trend.registros.map((item) => item.peso_kg)).toEqual([80, 78, 77.5]);
    expect(trend.pontos).toHaveLength(3);
    expect(trend.polyline).toContain('28.0,28.0');
    expect(trend.variacao).toBe(-2.5);
  });

  it('centraliza uma medicao unica e ignora registros invalidos', () => {
    const trend = criarTendenciaPeso([
      { peso_kg: '75', registrado_em: '2026-09-25T12:00:00-03:00' },
      { peso_kg: 'x', registrado_em: 'invalida' },
    ]);
    expect(trend.pontos).toHaveLength(1);
    expect(trend.pontos[0]).toMatchObject({ x: 320, y: 90 });
    expect(trend.variacao).toBe(0);
  });
});
