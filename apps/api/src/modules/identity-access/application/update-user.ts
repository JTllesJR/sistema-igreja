import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import { UserNotFoundError } from '../domain/errors.js';
import type { UserId } from '../domain/ids.js';
import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';

const MAX_ATTEMPTS = 3;

/**
 * Carrega o usuário, aplica a mudança e grava, repetindo (releitura + nova aplicação) se outra gravação
 * ocorrer no meio. Duas abas fazendo login ao mesmo tempo não devem falhar por causa do travamento otimista.
 */
export async function updateUser(
  users: UserRepository,
  id: UserId,
  change: (user: User) => void,
): Promise<User> {
  for (let attempt = 1; ; attempt++) {
    const user = await users.findById(id);
    if (!user) throw new UserNotFoundError();

    change(user);
    try {
      await users.save(user);
      return user;
    } catch (error) {
      if (
        !(error instanceof ConcurrencyConflictError) ||
        attempt >= MAX_ATTEMPTS
      ) {
        throw error;
      }
    }
  }
}
