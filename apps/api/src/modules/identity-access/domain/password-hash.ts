import { ValidationError } from '../../../shared/domain/domain-error.js';

// Formato PHC do argon2id: $argon2id$v=19$m=<memória KiB>,t=<passes>,p=<paralelismo>$<salt>$<hash> (base64 sem "=").
const PHC =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

export interface PasswordHashParameters {
  memory: number;
  passes: number;
  parallelism: number;
}

/**
 * Hash de senha (argon2id) no formato PHC, que carrega os próprios parâmetros: dá para endurecê-los no futuro e
 * re-hashar no login quando `parameters` ficar abaixo do desejado (ADR 0010).
 */
export class PasswordHash {
  private constructor(
    readonly value: string,
    readonly parameters: PasswordHashParameters,
  ) {}

  static of(value: string): PasswordHash {
    const match = PHC.exec(value);
    if (!match) {
      throw new ValidationError(
        'passwordHash',
        'O hash de senha não está no formato argon2id esperado.',
      );
    }
    return new PasswordHash(value, {
      memory: Number(match[1]),
      passes: Number(match[2]),
      parallelism: Number(match[3]),
    });
  }

  equals(other: PasswordHash): boolean {
    return this.value === other.value;
  }
}
