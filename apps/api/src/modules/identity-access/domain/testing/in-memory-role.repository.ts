import type { OrganizationId } from '../../../../shared/domain/identifiers.js';
import { RoleNameAlreadyInUseError } from '../errors.js';
import type { RoleId } from '../ids.js';
import type { Permission } from '../permission.js';
import { ADMINISTRATOR_ROLE_NAME, Role } from '../role.js';
import type { RoleRepository } from '../role.repository.js';

/** Repositório em memória para testes. `Role` é imutável, então pode ser guardado e devolvido diretamente. */
export class InMemoryRoleRepository implements RoleRepository {
  readonly #store = new Map<string, Role>();

  findByIds(ids: readonly RoleId[]): Promise<Role[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const role = this.#store.get(id);
        return role ? [role] : [];
      }),
    );
  }

  findAdministrator(organizationId: OrganizationId): Promise<Role | null> {
    const found = [...this.#store.values()].find(
      (role) =>
        role.organizationId === organizationId &&
        role.isSystem &&
        role.name.value === ADMINISTRATOR_ROLE_NAME,
    );
    return Promise.resolve(found ?? null);
  }

  listByOrganization(organizationId: OrganizationId): Promise<Role[]> {
    return Promise.resolve(
      [...this.#store.values()].filter(
        (role) => role.organizationId === organizationId,
      ),
    );
  }

  add(role: Role): Promise<void> {
    const nameTaken = [...this.#store.values()].some(
      (existing) =>
        existing.organizationId === role.organizationId &&
        existing.name.value.toLowerCase() === role.name.value.toLowerCase(),
    );
    if (nameTaken) {
      return Promise.reject(new RoleNameAlreadyInUseError(role.name.value));
    }
    this.#store.set(role.id, role);
    return Promise.resolve();
  }

  save(role: Role): Promise<void> {
    const current = this.#store.get(role.id);
    if (!current || current.organizationId !== role.organizationId) {
      return Promise.resolve();
    }
    const nameTaken = [...this.#store.values()].some(
      (existing) =>
        existing.id !== role.id &&
        existing.organizationId === role.organizationId &&
        existing.name.value.toLowerCase() === role.name.value.toLowerCase(),
    );
    if (nameTaken) {
      return Promise.reject(new RoleNameAlreadyInUseError(role.name.value));
    }
    this.#store.set(role.id, role);
    return Promise.resolve();
  }

  remove(organizationId: OrganizationId, roleId: RoleId): Promise<void> {
    if (this.#store.get(roleId)?.organizationId === organizationId) {
      this.#store.delete(roleId);
    }
    return Promise.resolve();
  }

  replacePermissions(
    roleId: RoleId,
    permissions: readonly Permission[],
  ): Promise<void> {
    const role = this.#store.get(roleId);
    if (role) {
      this.#store.set(
        roleId,
        Role.restore({
          id: role.id,
          organizationId: role.organizationId,
          name: role.name,
          isSystem: role.isSystem,
          permissions,
        }),
      );
    }
    return Promise.resolve();
  }
}
