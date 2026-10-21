import { ValidationError } from '../../../shared/domain/domain-error.js';
import {
  collapseWhitespace,
  comparisonKey,
} from '../../../shared/domain/text.js';

/**
 * Nome da congregação.
 *
 * `value` guarda a grafia original (para exibir); a igualdade usa `key`, que ignora caixa, acentos e espaços.
 * É assim que o domínio garante "nome único na organização" (regra 2 do ADR 0009).
 */
export class CongregationName {
  static readonly MIN_LENGTH = 2;
  static readonly MAX_LENGTH = 100;

  private constructor(
    readonly value: string,
    private readonly key: string,
  ) {}

  static create(raw: string): CongregationName {
    const value = collapseWhitespace(raw);

    if (
      value.length < CongregationName.MIN_LENGTH ||
      value.length > CongregationName.MAX_LENGTH
    ) {
      throw new ValidationError(
        'name',
        `O nome da congregação deve ter entre ${CongregationName.MIN_LENGTH} e ${CongregationName.MAX_LENGTH} caracteres.`,
      );
    }

    return new CongregationName(value, comparisonKey(value));
  }

  equals(other: CongregationName): boolean {
    return this.key === other.key;
  }
}
