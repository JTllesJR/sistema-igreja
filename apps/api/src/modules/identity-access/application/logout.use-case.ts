import type { Clock } from '../../../shared/application/clock.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { RefreshTokenCodec } from './refresh-token-codec.js';

export interface LogoutCommand {
  refreshToken: string;
}

/**
 * UC-01 (sair): revoga a família do token informado, o que encerra aquele dispositivo (inclusive tokens já trocados).
 * Idempotente e silencioso: token desconhecido não dá erro, para não revelar o que existe.
 */
export class LogoutUseCase {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly codec: RefreshTokenCodec,
    private readonly clock: Clock,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    const session = await this.sessions.findByTokenHash(
      this.codec.hashOf(command.refreshToken),
    );
    if (!session) return;

    await this.sessions.revokeFamily(session.familyId, this.clock.now());
  }
}
