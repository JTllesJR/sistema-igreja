import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { RoleId } from './ids.js';
import { Permission } from './permission.js';
import { RoleName } from './role-name.js';

export const ADMINISTRATOR_ROLE_NAME = 'Administrador';

/**
 * Papel: um conjunto de permissões, por igreja (ADR 0004). Papéis de sistema não são editáveis pelo usuário.
 * Nesta fatia só existe o Administrador; papéis personalizados (UC-02) usarão a mesma estrutura.
 */
export class Role {
  readonly #permissions: readonly Permission[];

  private constructor(
    readonly id: RoleId,
    readonly organizationId: OrganizationId,
    readonly name: RoleName,
    readonly isSystem: boolean,
    permissions: readonly Permission[],
  ) {
    this.#permissions = permissions;
  }

  /** Papel de sistema com a permissão curinga: concede tudo, inclusive permissões futuras (ADR 0010). */
  static administrator(input: {
    id: RoleId;
    organizationId: OrganizationId;
  }): Role {
    return new Role(
      input.id,
      input.organizationId,
      RoleName.create(ADMINISTRATOR_ROLE_NAME),
      true,
      [Permission.ALL],
    );
  }

  static restore(input: {
    id: RoleId;
    organizationId: OrganizationId;
    name: RoleName;
    isSystem: boolean;
    permissions: readonly Permission[];
  }): Role {
    const unique = [
      ...new Map(input.permissions.map((p) => [p.value, p])).values(),
    ];
    return new Role(
      input.id,
      input.organizationId,
      input.name,
      input.isSystem,
      unique,
    );
  }

  get permissions(): readonly Permission[] {
    return [...this.#permissions];
  }

  grants(required: Permission): boolean {
    return this.#permissions.some((granted) => granted.covers(required));
  }
}
