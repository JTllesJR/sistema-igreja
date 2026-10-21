import { ValidationError } from '../../../shared/domain/domain-error.js';

/** Telefone brasileiro: DDD + número (10 ou 11 dígitos). Guardado só com dígitos. */
export class Phone {
  private constructor(readonly value: string) {}

  /** Aceita como a pessoa digita: "(81) 99999-8888", "+55 81 99999-8888", "81999998888". */
  static create(raw: string): Phone {
    let digits = raw.replace(/\D/g, '');
    // Código do país: só é descartado quando o tamanho confirma que sobrou um número nacional completo.
    if (
      digits.startsWith('55') &&
      (digits.length === 12 || digits.length === 13)
    ) {
      digits = digits.slice(2);
    }
    if (digits.length < 10 || digits.length > 11) {
      throw new ValidationError(
        'phone',
        'O telefone deve ter DDD e 8 ou 9 dígitos.',
      );
    }
    return new Phone(digits);
  }

  equals(other: Phone): boolean {
    return this.value === other.value;
  }
}
