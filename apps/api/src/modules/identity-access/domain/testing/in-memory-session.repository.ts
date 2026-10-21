import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import type { SessionFamilyId, SessionId, UserId } from '../ids.js';
import type { Session } from '../session.js';
import type { SessionRepository } from '../session.repository.js';

/** Repositório em memória para testes. `Session` é imutável, então pode ser guardada e devolvida diretamente. */
export class InMemorySessionRepository implements SessionRepository {
  readonly #store = new Map<string, Session>();

  findById(id: SessionId): Promise<Session | null> {
    return Promise.resolve(this.#store.get(id) ?? null);
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    const found = [...this.#store.values()].find(
      (s) => s.tokenHash === tokenHash,
    );
    return Promise.resolve(found ?? null);
  }

  add(session: Session): Promise<void> {
    this.#store.set(session.id, session);
    return Promise.resolve();
  }

  /** Condicional: só grava se a sessão anterior ainda não foi trocada nem revogada (equivale ao UPDATE ... WHERE). */
  rotate(previous: Session, next: Session): Promise<void> {
    const stored = this.#store.get(previous.id);
    if (!stored || stored.rotatedAt !== null || stored.revokedAt !== null) {
      return Promise.reject(new ConcurrencyConflictError());
    }
    this.#store.set(previous.id, previous);
    this.#store.set(next.id, next);
    return Promise.resolve();
  }

  revokeFamily(familyId: SessionFamilyId, now: Date): Promise<void> {
    for (const session of this.#store.values()) {
      if (session.familyId === familyId) {
        this.#store.set(session.id, session.revoke(now));
      }
    }
    return Promise.resolve();
  }

  revokeAllForUser(
    userId: UserId,
    now: Date,
    options?: { exceptFamilyId?: SessionFamilyId },
  ): Promise<void> {
    for (const session of this.#store.values()) {
      if (
        session.userId === userId &&
        session.familyId !== options?.exceptFamilyId
      ) {
        this.#store.set(session.id, session.revoke(now));
      }
    }
    return Promise.resolve();
  }
}
