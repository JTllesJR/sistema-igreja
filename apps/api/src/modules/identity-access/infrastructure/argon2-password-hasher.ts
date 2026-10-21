import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  PasswordHash,
  type PasswordHashParameters,
} from '../domain/password-hash.js';
import type { PlainPassword } from '../domain/plain-password.js';
import type { PasswordHasher } from '../application/password-hasher.js';

const SALT_BYTES = 16;
const TAG_BYTES = 32;

// Mínimo recomendado pela OWASP para argon2id (ADR 0010): 19 MiB, 2 passes, 1 faixa, cerca de 50 ms.
// Não usamos 64 MiB: com várias tentativas simultâneas a memória por tentativa viraria negação de serviço.
const DEFAULT_PARAMETERS: PasswordHashParameters = {
  memory: 19_456,
  passes: 2,
  parallelism: 1,
};

export interface Argon2Options {
  /** Memória em KiB. */
  memory?: number;
  passes?: number;
}

/**
 * Hash de senha com o argon2id EMBUTIDO no Node (`crypto.argon2`): nenhuma dependência nativa nem script de
 * instalação (ADR 0008). Roda fora do laço de eventos, então não trava a API durante o cálculo.
 *
 * A verificação usa os parâmetros gravados NO PRÓPRIO hash. Assim, endurecer a configuração depois não invalida
 * senhas existentes: `needsRehash` aponta quais hashes ficaram para trás e o login os atualiza.
 */
export class Argon2PasswordHasher implements PasswordHasher {
  readonly #target: PasswordHashParameters;

  constructor(options: Argon2Options = {}) {
    this.#target = {
      memory: options.memory ?? DEFAULT_PARAMETERS.memory,
      passes: options.passes ?? DEFAULT_PARAMETERS.passes,
      parallelism: DEFAULT_PARAMETERS.parallelism,
    };
  }

  async hash(password: PlainPassword): Promise<PasswordHash> {
    const salt = randomBytes(SALT_BYTES);
    const tag = await derive(password.reveal(), salt, this.#target, TAG_BYTES);
    const { memory, passes, parallelism } = this.#target;

    return PasswordHash.of(
      `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${toPhcBase64(salt)}$${toPhcBase64(tag)}`,
    );
  }

  async verify(password: PlainPassword, hash: PasswordHash): Promise<boolean> {
    const salt = Buffer.from(hash.salt, 'base64');
    const expected = Buffer.from(hash.digest, 'base64');
    const actual = await derive(
      password.reveal(),
      salt,
      hash.parameters,
      expected.length,
    );

    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  /** Hash MAIS FRACO que o padrão atual (memória ou passes)? Um hash mais forte não precisa ser refeito. */
  needsRehash(hash: PasswordHash): boolean {
    return (
      hash.parameters.memory < this.#target.memory ||
      hash.parameters.passes < this.#target.passes
    );
  }

  /** Gasta o tempo de uma verificação real, sem comparar com nada (login com e-mail inexistente). */
  async simulateVerification(password: PlainPassword): Promise<void> {
    await derive(password.reveal(), DUMMY_SALT, this.#target, TAG_BYTES);
  }
}

const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 1);

function derive(
  message: string,
  nonce: Buffer,
  parameters: PasswordHashParameters,
  tagLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      {
        message: Buffer.from(message, 'utf8'),
        nonce,
        parallelism: parameters.parallelism,
        tagLength,
        memory: parameters.memory,
        passes: parameters.passes,
      },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

/** O formato PHC usa base64 padrão SEM os "=" do final. */
function toPhcBase64(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}
