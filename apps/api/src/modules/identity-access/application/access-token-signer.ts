import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { SessionId, UserId } from '../domain/ids.js';

/** O que o token de acesso afirma. Permissões NÃO vão aqui: mudanças de papel valem na hora (ADR 0010). */
export interface AccessTokenClaims {
  userId: UserId;
  organizationId: OrganizationId;
  sessionId: SessionId;
}

export interface SignedAccessToken {
  token: string;
  expiresAt: Date;
}

/** Porta para emitir o token de acesso de curta duração (JWT na infraestrutura). */
export interface AccessTokenSigner {
  sign(claims: AccessTokenClaims, now: Date): Promise<SignedAccessToken>;
}
