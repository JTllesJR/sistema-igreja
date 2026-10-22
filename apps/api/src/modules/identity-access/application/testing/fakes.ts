import { createHash } from 'node:crypto';
import type {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { PasswordHash } from '../../domain/password-hash.js';
import type { PlainPassword } from '../../domain/plain-password.js';
import type {
  AccessTokenClaims,
  AccessTokenSigner,
  SignedAccessToken,
} from '../access-token-signer.js';
import type { OrganizationDirectory } from '../organization-directory.js';
import type { PasswordHasher } from '../password-hasher.js';
import type { RefreshTokenCodec } from '../refresh-token-codec.js';
import type { TemporaryPasswordGenerator } from '../temporary-password-generator.js';

const encode = (text: string): string =>
  Buffer.from(text, 'utf8').toString('base64').replace(/=+$/, '');

/**
 * Hasher barato e determinístico para os testes (argon2 de verdade é lento). Produz um hash no formato PHC válido
 * e conta as chamadas, o que permite afirmar, por exemplo, que o login com e-mail inexistente "gastou" tempo.
 */
export class FakePasswordHasher implements PasswordHasher {
  hashCalls = 0;
  verifyCalls = 0;
  simulatedCalls = 0;
  rehashNeeded = false;

  hash(password: PlainPassword): Promise<PasswordHash> {
    this.hashCalls += 1;
    return Promise.resolve(
      // O sal muda a cada chamada, como no argon2 de verdade: hashes da mesma senha são diferentes.
      PasswordHash.of(
        `$argon2id$v=19$m=19456,t=2,p=1$${encode(`fake-salt-${this.hashCalls}`)}$${encode(password.reveal())}`,
      ),
    );
  }

  verify(password: PlainPassword, hash: PasswordHash): Promise<boolean> {
    this.verifyCalls += 1;
    return Promise.resolve(
      hash.value.endsWith(`$${encode(password.reveal())}`),
    );
  }

  needsRehash(): boolean {
    return this.rehashNeeded;
  }

  simulateVerification(): Promise<void> {
    this.simulatedCalls += 1;
    return Promise.resolve();
  }
}

export class FakeAccessTokenSigner implements AccessTokenSigner {
  static readonly TTL_MS = 15 * 60_000;
  readonly signed: AccessTokenClaims[] = [];

  sign(claims: AccessTokenClaims, now: Date): Promise<SignedAccessToken> {
    this.signed.push(claims);
    return Promise.resolve({
      token: `access:${claims.userId}:${claims.sessionId}`,
      expiresAt: new Date(now.getTime() + FakeAccessTokenSigner.TTL_MS),
    });
  }
}

export class FakeRefreshTokenCodec implements RefreshTokenCodec {
  #counter = 0;

  generate(): { token: string; hash: string } {
    this.#counter += 1;
    const token = `refresh-token-${this.#counter}`;
    return { token, hash: this.hashOf(token) };
  }

  hashOf(token: string): string {
    // SHA-256 de verdade, como na implementação real: o hash não contém o token e não permite recuperá-lo.
    return createHash('sha256').update(token).digest('hex');
  }
}

export class FakeOrganizationDirectory implements OrganizationDirectory {
  readonly #known = new Set<string>();
  readonly #congregations = new Map<string, 'ACTIVE' | 'INACTIVE'>();

  add(id: OrganizationId): void {
    this.#known.add(id);
  }

  /** Congregação DE uma igreja; o isolamento entre igrejas vem da chave (igreja + congregação). */
  addCongregation(
    organizationId: OrganizationId,
    congregationId: CongregationId,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ): void {
    this.#congregations.set(`${organizationId}/${congregationId}`, status);
  }

  exists(id: OrganizationId): Promise<boolean> {
    return Promise.resolve(this.#known.has(id));
  }

  isCongregationActive(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<boolean> {
    return Promise.resolve(
      this.#congregations.get(`${organizationId}/${congregationId}`) ===
        'ACTIVE',
    );
  }
}

/** Senhas temporárias previsíveis (Temp-0001-xxxx, Temp-0002-xxxx...), que cumprem a política de senha. */
export class FakeTemporaryPasswordGenerator implements TemporaryPasswordGenerator {
  #count = 0;

  generate(): string {
    this.#count += 1;
    return `Temp-${String(this.#count).padStart(4, '0')}-xxxx`;
  }
}
