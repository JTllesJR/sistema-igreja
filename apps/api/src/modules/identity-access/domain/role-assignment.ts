import type { CongregationId } from '../../../shared/domain/identifiers.js';
import type { RoleId } from './ids.js';

/**
 * Liga um usuário a um papel em um escopo: a igreja toda (`congregationId` nulo) ou uma congregação (ADR 0004).
 * Vive dentro do agregado `User`.
 */
export class RoleAssignment {
  private constructor(
    readonly roleId: RoleId,
    readonly congregationId: CongregationId | null,
  ) {}

  static create(input: {
    roleId: RoleId;
    congregationId?: CongregationId | null;
  }): RoleAssignment {
    return new RoleAssignment(input.roleId, input.congregationId ?? null);
  }

  get isOrganizationWide(): boolean {
    return this.congregationId === null;
  }

  equals(other: RoleAssignment): boolean {
    return (
      this.roleId === other.roleId &&
      this.congregationId === other.congregationId
    );
  }
}
