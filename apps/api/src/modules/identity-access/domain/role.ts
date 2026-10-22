import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { RoleId } from './ids.js';
import { Permission } from './permission.js';
import { RoleName } from './role-name.js';

export const ADMINISTRATOR_ROLE_NAME = 'Administrador';
export const LEADER_ROLE_NAME = 'Dirigente';
export const SECRETARY_ROLE_NAME = 'Secretário';

/**
 * Papel: um conjunto de permissões, por igreja (ADR 0004). Papéis de sistema não são editáveis pelo usuário.
 * Papéis padrão (Administrador, Dirigente, Secretário) são de sistema e fixos no código (ADR 0014); papéis
 * personalizados (UC-02 completo) usarão a mesma estrutura.
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

  /**
   * Dirigente: acesso total aos membros da sua congregação (PRD). As permissões são texto (e não as constantes do
   * módulo `members`) para o domínio não importar outros módulos; `role.spec.ts` confere os textos com os módulos dono.
   */
  static leader(input: { id: RoleId; organizationId: OrganizationId }): Role {
    return Role.system(input, LEADER_ROLE_NAME, [
      'members:read',
      'members:write',
      'members:anonymize',
      'organization:read',
    ]);
  }

  /** Secretário: cadastra e consulta membros e enxerga a igreja. Não anonimiza nem gere a igreja. */
  static secretary(input: {
    id: RoleId;
    organizationId: OrganizationId;
  }): Role {
    return Role.system(input, SECRETARY_ROLE_NAME, [
      'members:read',
      'members:write',
      'organization:read',
    ]);
  }

  private static system(
    input: { id: RoleId; organizationId: OrganizationId },
    name: string,
    permissions: readonly string[],
  ): Role {
    return new Role(
      input.id,
      input.organizationId,
      RoleName.create(name),
      true,
      permissions.map((p) => Permission.of(p)),
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
