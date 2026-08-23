import { GamificationService } from './gamification.service';
import { parseDuration } from '../auth/auth.service';

describe('Curva de nivel', () => {
  it('empieza en el nivel 1 sin experiencia', () => {
    expect(GamificationService.levelFor(0)).toBe(1);
    expect(GamificationService.levelFor(99)).toBe(1);
  });

  it('sube de nivel en los umbrales cuadraticos', () => {
    expect(GamificationService.levelFor(100)).toBe(2);
    expect(GamificationService.levelFor(399)).toBe(2);
    expect(GamificationService.levelFor(400)).toBe(3);
    expect(GamificationService.levelFor(900)).toBe(4);
  });

  it('nunca decrece', () => {
    let previous = 0;
    for (let experience = 0; experience <= 5000; experience += 37) {
      const level = GamificationService.levelFor(experience);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('trata la experiencia negativa como cero en lugar de romperse', () => {
    expect(GamificationService.levelFor(-500)).toBe(1);
  });
});

describe('parseDuration', () => {
  it('interpreta las unidades admitidas', () => {
    expect(parseDuration('900s')).toBe(900_000);
    expect(parseDuration('15m')).toBe(900_000);
    expect(parseDuration('12h')).toBe(43_200_000);
    expect(parseDuration('7d')).toBe(604_800_000);
    expect(parseDuration('250ms')).toBe(250);
  });

  it('tolera espacios alrededor', () => {
    expect(parseDuration('  30m  ')).toBe(1_800_000);
  });

  it('rechaza formatos invalidos en lugar de devolver NaN', () => {
    expect(() => parseDuration('cinco minutos')).toThrow();
    expect(() => parseDuration('10')).toThrow();
    expect(() => parseDuration('10y')).toThrow();
  });
});
