import type { CongregationId } from '../../../shared/domain/identifiers.js';
import type { Permission } from './permission.js';
import type { Role } from './role.js';
import type { RoleAssignment } from './role-assignment.js';

/**
 * Onde o usuário tem uma permissão. É o que o guard da rota e o filtro dos repositórios usam (ADR 0004):
 * nenhum lugar, a igreja inteira ou uma lista de congregações.
 */
export type PermissionScope =
  | { kind: 'NONE' }
  | { kind: 'ORGANIZATION' }
  | { kind: 'CONGREGATIONS'; congregationIds: readonly CongregationId[] };

interface Grant {
  role: Role;
  congregationId: CongregationId | null;
}

/** O que um usuário pode fazer, calculado das suas atribuições e dos papéis correspondentes. */
export class AccessPolicy {
  private constructor(private readonly grants: readonly Grant[]) {}

  /** Atribuição cujo papel não foi fornecido (ex.: papel removido) não concede nada: falha fechada. */
  static from(
    assignments: readonly RoleAssignment[],
    roles: readonly Role[],
  ): AccessPolicy {
    const byId = new Map(roles.map((role) => [role.id, role]));

    return new AccessPolicy(
      assignments.flatMap((assignment) => {
        const role = byId.get(assignment.roleId);
        return role
          ? [{ role, congregationId: assignment.congregationId }]
          : [];
      }),
    );
  }

  /** Tem a permissão em ALGUM escopo? É a pergunta do guard da rota. */
  hasPermission(permission: Permission): boolean {
    return this.grantsFor(permission).length > 0;
  }

  /** Tem a permissão nesta congregação? Uma atribuição para a igreja toda cobre qualquer congregação. */
  can(permission: Permission, congregationId: CongregationId): boolean {
    return this.grantsFor(permission).some(
      (grant) =>
        grant.congregationId === null ||
        grant.congregationId === congregationId,
    );
  }

  /**
   * Tem a permissão para a IGREJA TODA, e não só para algumas congregações? Ações que mexem no que é de todos
   * (ex.: criar congregações) exigem isto: `hasPermission` sozinho deixaria um dirigente de UMA congregação agir em todas.
   */
  hasOrganizationWide(permission: Permission): boolean {
    return this.scopeFor(permission).kind === 'ORGANIZATION';
  }

  scopeFor(permission: Permission): PermissionScope {
    const grants = this.grantsFor(permission);

    if (grants.length === 0) return { kind: 'NONE' };
    if (grants.some((grant) => grant.congregationId === null)) {
      return { kind: 'ORGANIZATION' };
    }

    const ids = grants.flatMap((grant) =>
      grant.congregationId === null ? [] : [grant.congregationId],
    );
    return { kind: 'CONGREGATIONS', congregationIds: [...new Set(ids)] };
  }

  private grantsFor(permission: Permission): Grant[] {
    return this.grants.filter((grant) => grant.role.grants(permission));
  }
}
