import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { RoleId } from './ids.js';
import type { Permission } from './permission.js';
import type { Role } from './role.js';

/**
 * Porta de persistência de `Role`.
 *
 * Contrato (verificado por `describeRoleRepositoryContract`):
 *  - `findByIds` ignora ids que não existem (o chamador decide o que fazer com a ausência).
 *  - `findAdministrator` devolve o papel de sistema "Administrador" DAQUELA organização, ou `null`.
 *  - `add` falha com `RoleNameAlreadyInUseError` se a organização já tem um papel com o mesmo nome.
 *  - `replacePermissions` troca TODO o conjunto de permissões do papel, de uma vez (tudo ou nada). Papel inexistente é
 *    ignorado. Existe para manter os papéis de sistema iguais à definição do código (ADR 0015).
 *  - `save` grava o nome e TODO o conjunto de permissões de um papel que já existe nesta igreja, de uma vez (tudo ou
 *    nada). Falha com `RoleNameAlreadyInUseError` se outro papel da igreja já tem o nome. Papel inexistente é ignorado.
 *  - `remove` exclui o papel e suas permissões; papel inexistente ou de outra igreja é ignorado. No banco, a chave
 *    estrangeira das atribuições recusa excluir papel atribuído e a implementação traduz para `RoleInUseError` (o fake
 *    não conhece atribuições: o caso de uso confere antes, e o banco é a rede de segurança para a corrida).
 */
export interface RoleRepository {
  findByIds(ids: readonly RoleId[]): Promise<Role[]>;
  findAdministrator(organizationId: OrganizationId): Promise<Role | null>;
  listByOrganization(organizationId: OrganizationId): Promise<Role[]>;
  add(role: Role): Promise<void>;
  replacePermissions(
    roleId: RoleId,
    permissions: readonly Permission[],
  ): Promise<void>;
  save(role: Role): Promise<void>;
  remove(organizationId: OrganizationId, roleId: RoleId): Promise<void>;
}
