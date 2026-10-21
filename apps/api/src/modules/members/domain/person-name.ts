import { ValidationError } from '../../../shared/domain/domain-error.js';
import {
  collapseWhitespace,
  comparisonKey,
} from '../../../shared/domain/text.js';

const MIN_LENGTH = 2;
const MAX_LENGTH = 150;

/** Qualquer caractere de controle (inclui quebra de linha e tabulação): não cabe em um nome. */
const CONTROL_CHARACTERS = /\p{Cc}/u;
const HAS_LETTER = /\p{L}/u;

/** Texto que ocupa o lugar do nome depois da anonimização. */
export const ANONYMIZED_NAME = 'Membro anonimizado';

/** Nome completo de uma pessoa. Imutável. */
export class PersonName {
  private constructor(readonly value: string) {}

  static create(raw: string): PersonName {
    const value = collapseWhitespace(raw);

    if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
      throw new ValidationError(
        'fullName',
        `O nome deve ter entre ${MIN_LENGTH} e ${MAX_LENGTH} caracteres.`,
      );
    }
    if (CONTROL_CHARACTERS.test(value) || !HAS_LETTER.test(value)) {
      throw new ValidationError(
        'fullName',
        'O nome contém caracteres inválidos.',
      );
    }
    return new PersonName(value);
  }

  static anonymized(): PersonName {
    return new PersonName(ANONYMIZED_NAME);
  }

  /** Para a busca: sem acentos, caixa nem espaços sobrando. Nunca para exibir. */
  get searchKey(): string {
    return comparisonKey(this.value);
  }

  equals(other: PersonName): boolean {
    return this.value === other.value;
  }
}
