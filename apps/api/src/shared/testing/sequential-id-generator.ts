import type { IdGenerator } from '../application/id-generator.js';
import { uuidFor } from './uuid-for.js';

/** Gera ids previsíveis (start, start+1, ...), o que torna os testes legíveis e determinísticos. */
export class SequentialIdGenerator implements IdGenerator {
  #counter: number;

  constructor(start = 1) {
    this.#counter = start;
  }

  next(): string {
    return uuidFor(this.#counter++);
  }
}
