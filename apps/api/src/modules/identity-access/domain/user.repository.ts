import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { Email } from './email.js';
import type { RoleId, UserId } from './ids.js';
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
 *  - `listByOrganization` devolve só os usuários DAQUELA organização, com as atribuições.
 *  - `saveGuardingLastAdministrator` é um `save` que, na MESMA transação e serializado por igreja, recusa com
 *    `LastAdministratorError` (sem gravar nada) se, depois da gravação, a igreja ficaria sem nenhum administrador
 *    ativo (`User.isActiveAdministrator`). A serialização é o que impede que dois administradores se removam ao
 *    mesmo tempo: a versão otimista é por usuário e não enxergaria essa corrida.
 */
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  listByOrganization(organizationId: OrganizationId): Promise<User[]>;
  add(user: User): Promise<void>;
  save(user: User): Promise<void>;
  saveGuardingLastAdministrator(
    user: User,
    administratorRoleId: RoleId,
  ): Promise<void>;
}
