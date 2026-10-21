import type { Email } from './email.js';
import type { UserId } from './ids.js';
import type { User } from './user.js';

/**
 * Porta de persistência do agregado `User` (a implementação fica na infraestrutura).
 *
 * Contrato (verificado por `describeUserRepositoryContract`):
 *  - `findById` e `findByEmail` devolvem cópias independentes. O e-mail é único em TODO o sistema (ADR 0010).
 *  - `add` insere e falha com `EmailAlreadyRegisteredError` se o e-mail já existe.
 *  - `save` grava o agregado inteiro (dados e atribuições) de forma atômica, com travamento otimista por `version`:
 *    falha com `ConcurrencyConflictError` se outra gravação ocorreu e com `UserNotFoundError` se o usuário não existe.
 *    A cada `save` bem-sucedido a versão avança em 1.
 */
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  add(user: User): Promise<void>;
  save(user: User): Promise<void>;
}
