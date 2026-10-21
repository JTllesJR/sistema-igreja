import { ValidationError } from '../../../shared/domain/domain-error.js';

// Formato PHC do argon2id: $argon2id$v=19$<parâmetros>$<salt>$<hash>, com salt e hash em base64 sem "=".
// Os parâmetros são pares chave=valor (m=memória em KiB, t=passes, p=paralelismo). A ORDEM varia entre
// implementações (a biblioteca de referência escreve m,p,t), então são lidos por nome e não por posição.
const PHC = /^\$argon2id\$v=19\$([^$]+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

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
    /** Salt em base64 (sem "="). */
    readonly salt: string,
    /** Resultado do argon2 em base64 (sem "="). */
    readonly digest: string,
  ) {}

  static of(value: string): PasswordHash {
    const match = PHC.exec(value);
    const parameters = match ? parseParameters(match[1] ?? '') : null;

    if (!match || !parameters) {
      throw new ValidationError(
        'passwordHash',
        'O hash de senha não está no formato argon2id esperado.',
      );
    }
    return new PasswordHash(value, parameters, match[2] ?? '', match[3] ?? '');
  }

  equals(other: PasswordHash): boolean {
    return this.value === other.value;
  }
}

/** Exige exatamente m, t e p, numéricos e sem repetição; qualquer ordem. */
function parseParameters(raw: string): PasswordHashParameters | null {
  const found = new Map<string, number>();

  for (const pair of raw.split(',')) {
    const [key, number, ...rest] = pair.split('=');
    if (
      !key ||
      !number ||
      rest.length > 0 ||
      !/^\d+$/.test(number) ||
      !['m', 't', 'p'].includes(key) ||
      found.has(key)
    ) {
      return null;
    }
    found.set(key, Number(number));
  }

  const memory = found.get('m');
  const passes = found.get('t');
  const parallelism = found.get('p');
  if (
    memory === undefined ||
    passes === undefined ||
    parallelism === undefined
  ) {
    return null;
  }
  return { memory, passes, parallelism };
}
