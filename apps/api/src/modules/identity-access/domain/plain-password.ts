import { ValidationError } from '../../../shared/domain/domain-error.js';
import type { Email } from './email.js';

const REDACTED = '[REDACTED]';

/**
 * Senha em texto, validada pela política do ADR 0010 (10 a 128 caracteres e diferente do e-mail).
 *
 * Existe só entre a entrada do usuário e o hash. Se for parar num log ou numa serialização por descuido,
 * sai "[REDACTED]". O valor real só é obtido de propósito, com `reveal()`.
 */
export class PlainPassword {
  static readonly MIN_LENGTH = 10;
  static readonly MAX_LENGTH = 128;

  readonly #secret: string;

  private constructor(secret: string) {
    this.#secret = secret;
  }

  /** Não apara espaços: a senha é preservada exatamente como foi digitada. */
  static create(raw: string, email: Email): PlainPassword {
    // NIST SP 800-63B: cada ponto de código Unicode conta como um caractere (não unidades UTF-16 nem grafemas).
    // oxlint-disable-next-line typescript/no-misused-spread -- contar pontos de código é o comportamento desejado
    const length = [...raw].length;

    if (
      length < PlainPassword.MIN_LENGTH ||
      length > PlainPassword.MAX_LENGTH
    ) {
      throw new ValidationError(
        'password',
        `A senha deve ter entre ${PlainPassword.MIN_LENGTH} e ${PlainPassword.MAX_LENGTH} caracteres.`,
      );
    }
    if (raw.trim().toLowerCase() === email.value) {
      throw new ValidationError(
        'password',
        'A senha não pode ser igual ao e-mail.',
      );
    }
    return new PlainPassword(raw);
  }

  reveal(): string {
    return this.#secret;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
