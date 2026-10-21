import { v7 } from 'uuid';
import type { IdGenerator } from '../application/id-generator.js';

/**
 * UUID v7: os primeiros bits são o instante de criação, então os ids saem em ordem crescente.
 * Isso mantém as chaves primárias do PostgreSQL "no fim do índice" (menos fragmentação que UUID v4 aleatório).
 */
export class UuidV7IdGenerator implements IdGenerator {
  next(): string {
    return v7();
  }
}
