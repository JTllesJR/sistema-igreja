import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenCodec } from '../application/refresh-token-codec.js';

/**
 * Token de renovação: 256 bits aleatórios entregues ao cliente; no banco fica só o SHA-256.
 *
 * SHA-256 (rápido) basta aqui, diferente da senha: o token já tem entropia máxima, então não há o que "adivinhar"
 * por força bruta. O hash serve para que um vazamento do banco não permita renovar nenhuma sessão.
 */
export class Sha256RefreshTokenCodec implements RefreshTokenCodec {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashOf(token) };
  }

  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
