import type { RequestContext } from '../../../shared/application/request-context.js';
import { SessionInvalidError, UserNotFoundError } from '../domain/errors.js';
import { UserId } from '../domain/ids.js';
import type { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';

/**
 * Carrega o usuário do contexto, garantindo que pertence à igreja do contexto e que está ativo.
 *
 * - Usuário de OUTRA igreja é tratado como inexistente (não revela que existe): isolamento entre igrejas (ADR 0003).
 * - Usuário desativado vira "sessão inválida": perde o acesso na hora, mesmo com token de acesso ainda dentro do prazo.
 */
export async function loadActiveUser(
  users: UserRepository,
  context: RequestContext,
): Promise<User> {
  const user = await users.findById(UserId.of(context.actorId));

  if (!user || user.organizationId !== context.organizationId) {
    throw new UserNotFoundError();
  }
  if (user.status !== 'ACTIVE') throw new SessionInvalidError();

  return user;
}
