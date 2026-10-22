import type { OrganizationId } from '../../../../shared/domain/identifiers.js';
import { RoleNameAlreadyInUseError } from '../errors.js';
import type { RoleId } from '../ids.js';
import { ADMINISTRATOR_ROLE_NAME, type Role } from '../role.js';
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
}
