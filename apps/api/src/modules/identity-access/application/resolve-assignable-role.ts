import type { RequestContext } from '../../../shared/application/request-context.js';
import type { CongregationId } from '../../../shared/domain/identifiers.js';
import {
  AdministratorScopeError,
  CongregationUnavailableError,
  RoleNotFoundError,
} from '../domain/errors.js';
import type { RoleId } from '../domain/ids.js';
import type { Role } from '../domain/role.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { OrganizationDirectory } from './organization-directory.js';

/**
 * As regras de "dar este papel neste escopo a alguém DESTA igreja", comuns a atribuir um papel e a criar um usuário:
 *  - o papel existe NESTA igreja (de outra igreja conta como inexistente, sem revelar qual dos casos ocorreu);
 *  - o Administrador só vale para a igreja toda;
 *  - a congregação existe nesta igreja e está ativa.
 */
export async function resolveAssignableRole(
  roles: RoleRepository,
  organizations: OrganizationDirectory,
  context: RequestContext,
  roleId: RoleId,
  congregationId: CongregationId | null,
): Promise<Role> {
  const role = (await roles.findByIds([roleId])).find(
    (found) => found.organizationId === context.organizationId,
  );
  if (!role) throw new RoleNotFoundError();

  if (congregationId !== null) {
    const administrator = await roles.findAdministrator(context.organizationId);
    if (administrator?.id === role.id) throw new AdministratorScopeError();

    const active = await organizations.isCongregationActive(
      context.organizationId,
      congregationId,
    );
    if (!active) throw new CongregationUnavailableError();
  }

  return role;
}
