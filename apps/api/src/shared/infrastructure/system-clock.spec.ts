import { describe, expect, it } from 'vitest';
import { SystemClock } from './system-clock.js';

describe('SystemClock', () => {
  it('devolve a hora atual', () => {
    const before = Date.now();

    const now = new SystemClock().now().getTime();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });

  it('devolve uma nova instância a cada chamada (quem recebe não altera a hora de outro)', () => {
    const clock = new SystemClock();

    expect(clock.now()).not.toBe(clock.now());
  });
});
