import type { Clock } from '../application/clock.js';

/** Relógio controlável: o teste decide que horas são e avança o tempo quando quiser. */
export class FixedClock implements Clock {
  #current: Date;

  constructor(start: Date) {
    this.#current = new Date(start);
  }

  now(): Date {
    return new Date(this.#current);
  }

  advance(ms: number): void {
    this.#current = new Date(this.#current.getTime() + ms);
  }
}
