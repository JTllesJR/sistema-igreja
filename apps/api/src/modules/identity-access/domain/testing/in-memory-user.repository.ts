import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import type { Email } from '../email.js';
import { EmailAlreadyRegisteredError, UserNotFoundError } from '../errors.js';
import type { UserId } from '../ids.js';
import { User } from '../user.js';
import type { UserRepository } from '../user.repository.js';

/** Repositório em memória para testes: guarda e devolve CÓPIAS e aplica o travamento otimista por versão. */
export class InMemoryUserRepository implements UserRepository {
  readonly #store = new Map<string, User>();

  findById(id: UserId): Promise<User | null> {
    const stored = this.#store.get(id);
    return Promise.resolve(stored ? copyOf(stored, stored.version) : null);
  }

  findByEmail(email: Email): Promise<User | null> {
    const stored = [...this.#store.values()].find((u) => u.email.equals(email));
    return Promise.resolve(stored ? copyOf(stored, stored.version) : null);
  }

  add(user: User): Promise<void> {
    if ([...this.#store.values()].some((u) => u.email.equals(user.email))) {
      return Promise.reject(new EmailAlreadyRegisteredError());
    }
    this.#store.set(user.id, copyOf(user, user.version));
    return Promise.resolve();
  }

  save(user: User): Promise<void> {
    const stored = this.#store.get(user.id);
    if (!stored) return Promise.reject(new UserNotFoundError());
    if (stored.version !== user.version) {
      return Promise.reject(new ConcurrencyConflictError());
    }
    this.#store.set(user.id, copyOf(user, user.version + 1));
    return Promise.resolve();
  }
}

function copyOf(user: User, version: number): User {
  return User.restore({
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    passwordHash: user.passwordHash,
    status: user.status,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
    lastLoginAt: user.lastLoginAt,
    assignments: user.assignments,
    version,
  });
}
