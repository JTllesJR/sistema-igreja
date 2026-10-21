import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import {
  SessionInvalidError,
  SessionReuseDetectedError,
} from '../domain/errors.js';
import { SessionId } from '../domain/ids.js';
import type { SessionPolicy } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { AccessTokenSigner } from './access-token-signer.js';
import type { RefreshTokenCodec } from './refresh-token-codec.js';
import type { TokensView } from './views.js';

export interface RefreshSessionCommand {
  refreshToken: string;
}

/**
 * UC-01 (renovar): troca um token de renovação por outro novo (rotação).
 *
 * Reapresentar um token JÁ TROCADO indica roubo (o dono legítimo e o ladrão têm cópias): revoga a família inteira
 * e ambos precisam entrar de novo. Vale também para a corrida em que duas requisições usam o mesmo token ao mesmo
 * tempo, pois a troca no repositório é condicional.
 */
export class RefreshSessionUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly signer: AccessTokenSigner,
    private readonly codec: RefreshTokenCodec,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly sessionPolicy: SessionPolicy,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<TokensView> {
    const now = this.clock.now();

    const session = await this.sessions.findByTokenHash(
      this.codec.hashOf(command.refreshToken),
    );
    if (!session) throw new SessionInvalidError();

    switch (session.state(now)) {
      case 'ROTATED':
        await this.sessions.revokeFamily(session.familyId, now);
        throw new SessionReuseDetectedError();
      case 'REVOKED':
      case 'EXPIRED':
        throw new SessionInvalidError();
      case 'ACTIVE':
        break;
    }

    // Usuário desativado depois do login: encerra a família. (Conta bloqueada por tentativas NÃO impede renovar,
    // senão um atacante errando a senha de propósito derrubaria o dono legítimo.)
    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.sessions.revokeFamily(session.familyId, now);
      throw new SessionInvalidError();
    }

    const refresh = this.codec.generate();
    const { previous, next } = session.rotate({
      nextId: SessionId.of(this.ids.next()),
      nextTokenHash: refresh.hash,
      now,
      policy: this.sessionPolicy,
    });

    try {
      await this.sessions.rotate(previous, next);
    } catch (error) {
      if (error instanceof ConcurrencyConflictError) {
        // Outra requisição trocou este mesmo token primeiro: trata como reuso.
        await this.sessions.revokeFamily(session.familyId, now);
        throw new SessionReuseDetectedError();
      }
      throw error;
    }

    const access = await this.signer.sign(
      {
        userId: user.id,
        organizationId: user.organizationId,
        sessionId: next.id,
      },
      now,
    );

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: next.expiresAt,
    };
  }
}
