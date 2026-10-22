import { ValidationError } from '../../../shared/domain/domain-error.js';

/** Teto de um lançamento: R$ 100 milhões, em centavos. Barra erro de digitação (um zero a mais) e estouro numérico. */
export const MAX_ENTRY_CENTS = 10_000_000_000;

/**
 * Valor de um lançamento: centavos INTEIROS e positivos (ADR 0005). Nunca `float`: 0,1 + 0,2 não é 0,3 em ponto flutuante.
 * O sentido (entrada ou saída) fica no lançamento; aqui o valor é sempre positivo.
 */
export class Money {
  private constructor(readonly cents: number) {}

  /** `field` identifica o campo na mensagem de erro. */
  static ofCents(cents: number, field = 'amountCents'): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new ValidationError(
        field,
        'O valor deve ser um número inteiro de centavos.',
      );
    }
    if (cents < 1) {
      throw new ValidationError(field, 'O valor deve ser maior que zero.');
    }
    if (cents > MAX_ENTRY_CENTS) {
      throw new ValidationError(
        field,
        'O valor é maior que o máximo permitido por lançamento.',
      );
    }
    return new Money(cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
