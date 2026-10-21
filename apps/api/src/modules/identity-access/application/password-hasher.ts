import type { PasswordHash } from '../domain/password-hash.js';
import type { PlainPassword } from '../domain/plain-password.js';

/** Porta para o algoritmo de hash de senha (argon2id na infraestrutura). */
export interface PasswordHasher {
  hash(password: PlainPassword): Promise<PasswordHash>;

  verify(password: PlainPassword, hash: PasswordHash): Promise<boolean>;

  /** Os parâmetros do hash estão abaixo do desejado hoje? Se sim, o login re-hasha a senha (ADR 0010). */
  needsRehash(hash: PasswordHash): boolean;

  /**
   * Gasta o tempo de uma verificação real sem comparar com nada. O login com e-mail inexistente chama isto para
   * não responder mais rápido que o login com senha errada, o que revelaria quais e-mails estão cadastrados.
   */
  simulateVerification(password: PlainPassword): Promise<void>;
}
