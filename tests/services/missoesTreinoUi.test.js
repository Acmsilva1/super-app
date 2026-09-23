import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatWorkoutElapsed, sameEntityId } from '../../features/missoes_treino/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'features/missoes_treino/index.js'), 'utf8');

describe('interacoes da UI de missoes de treino', () => {
  it('trata IDs numericos do Supabase e IDs textuais do dataset como o mesmo registro', () => {
    expect(sameEntityId(42, '42')).toBe(true);
    expect(sameEntityId('demo-1', 'demo-1')).toBe(true);
    expect(sameEntityId(42, '43')).toBe(false);
  });

  it('usa um modal simples para adicionar exercicio com nome e quantidade de series', () => {
    expect(source).toContain('data-role="exercise-modal"');
    expect(source).toContain('data-role="temp-name"');
    expect(source).toContain('data-role="temp-series"');
    expect(source).not.toContain('data-role="temp-reps"');
    expect(source).toContain("this.showToast('Adicione ao menos um exercício antes de salvar o treino.'");
  });

  it('permite escolher emoji no perfil sem exibir seletor de cor', () => {
    expect(source).toContain('data-role="profile-emoji"');
    expect(source).toContain('data-action="select-profile-emoji"');
    expect(source).not.toContain('data-role="profile-color"');
    expect(source).toContain('icone,');
    expect(source).not.toContain('data-role="profile-desc"');
  });

  it('formata o cronometro do check-in em horas, minutos e segundos', () => {
    expect(formatWorkoutElapsed(0)).toBe('00:00:00');
    expect(formatWorkoutElapsed(3_661_000)).toBe('01:01:01');
    expect(formatWorkoutElapsed(-1)).toBe('00:00:00');
    expect(formatWorkoutElapsed(Number.NaN)).toBe('00:00:00');
    expect(formatWorkoutElapsed(90_061_000)).toBe('25:01:01');
  });

  it('mantem o inicio do treino persistido ao fechar ou minimizar o modal', () => {
    expect(source).toContain("localStorage.setItem(this.workoutTimerKey(mission.id), String(Date.now()))");
    expect(source).toContain("if (action === 'minimize-workout') this.toggleWorkoutModalMinimized()");
    expect(source).toContain("if (action === 'close-workout') this.closeWorkoutModal()");
    expect(source).toContain("resource: 'workout-log'");
    expect(source).toContain('duration_seconds: durationSeconds');
    expect(source).toContain('localStorage.removeItem(this.workoutTimerKey(mission.id));');
    expect(source).toContain("data-action=\"delete-workout-log\"");
  });

  it('informa que o teste local persiste no navegador sem usar o Supabase', () => {
    expect(source).toContain('Teste local persistido no navegador. Nada vai para o Supabase.');
  });

  it('escapa dados vindos do banco antes de montar as linhas de logs', () => {
    expect(source).toContain("<td>${escapeHtml(log.workout_name || 'Treino')}</td>");
    expect(source).toContain('data-log-id="${escapeHtml(log.id)}"');
    expect(source).not.toContain('<td>${log.workout_name');
  });

  it('bloqueia finalizacao concorrente na interface e reseta somente apos a API confirmar', () => {
    const finishStart = source.indexOf('async finishWorkout()');
    const finishEnd = source.indexOf('async deleteWorkoutLog(', finishStart);
    const finishSource = source.slice(finishStart, finishEnd);

    expect(finishSource).toContain('this.workoutFinishEl.disabled = true;');
    expect(finishSource.indexOf("resource: 'workout-log'")).toBeLessThan(
      finishSource.indexOf('localStorage.removeItem(this.workoutTimerKey(mission.id));'),
    );
    expect(finishSource).toContain('this.workoutFinishEl.disabled = false;');
  });
});
