import type { Clock } from '../application/clock.js';

/** O relógio de verdade. Nos testes entra o `FixedClock`. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
