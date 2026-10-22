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
}
