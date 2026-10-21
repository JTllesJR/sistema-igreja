import { jwtVerify, SignJWT } from 'jose';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import type {
  AccessTokenClaims,
  AccessTokenSigner,
  SignedAccessToken,
} from '../application/access-token-signer.js';
import type { AccessTokenVerifier } from '../application/access-token-verifier.js';
import { SessionId, UserId } from '../domain/ids.js';

const MIN_SECRET_LENGTH = 32;

export interface JoseAccessTokenSignerOptions {
  secret: string;
  ttlSeconds: number;
}

/**
 * Emite e confere o token de acesso: JWT curto assinado com HS256 (ADR 0010).
 *
 * Carrega só `sub` (usuário), `org` (igreja) e `sid` (sessão), mais `iat`/`exp`. Permissões NÃO vão no token:
 * a cada requisição o guard consulta a política de acesso atual, então mudanças de papel valem na hora.
 */
export class JoseAccessTokenSigner
  implements AccessTokenSigner, AccessTokenVerifier
{
  readonly #key: Uint8Array;
  readonly #ttlSeconds: number;

  constructor(options: JoseAccessTokenSignerOptions) {
    if (options.secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `O segredo de assinatura deve ter pelo menos ${MIN_SECRET_LENGTH} caracteres.`,
      );
    }
    this.#key = new TextEncoder().encode(options.secret);
    this.#ttlSeconds = options.ttlSeconds;
  }

  async sign(claims: AccessTokenClaims, now: Date): Promise<SignedAccessToken> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = issuedAt + this.#ttlSeconds;

    const token = await new SignJWT({
      org: claims.organizationId,
      sid: claims.sessionId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(this.#key);

    return { token, expiresAt: new Date(expiresAt * 1000) };
  }

  /**
   * Confere assinatura, algoritmo (só HS256: recusa `none` e troca de algoritmo) e validade, e exige que o token traga
   * usuário, igreja e sessão em formato de identificador. Qualquer defeito vira `null`, sem dizer qual.
   */
  async verify(token: string, now: Date): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.#key, {
        algorithms: ['HS256'],
        currentDate: now,
        requiredClaims: ['sub', 'exp', 'iat'],
      });
      const { sub, org, sid } = payload as Record<string, unknown>;
      if (
        typeof sub !== 'string' ||
        typeof org !== 'string' ||
        typeof sid !== 'string'
      ) {
        return null;
      }
      return {
        userId: UserId.of(sub),
        organizationId: OrganizationId.of(org),
        sessionId: SessionId.of(sid),
      };
    } catch {
      return null;
    }
  }
}
