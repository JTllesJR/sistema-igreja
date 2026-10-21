import type { AccessTokenClaims } from './access-token-signer.js';

/**
 * Porta para conferir o token de acesso (JWT na infraestrutura). Devolve `null` para QUALQUER defeito (assinatura
 * errada, expirado, malformado, algoritmo inesperado): o guard trata todos como "não autenticado" e não revela qual.
 */
export interface AccessTokenVerifier {
  verify(token: string, now: Date): Promise<AccessTokenClaims | null>;
}
