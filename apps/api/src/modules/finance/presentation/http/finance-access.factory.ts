import type { CongregationId } from '../../../../shared/domain/identifiers.js';
// Só a API pública do módulo `identity-access` (ADR 0001).
import {
  type AccessPolicy,
  Permission,
} from '../../../identity-access/index.js';
import type { FinanceAccess } from '../../application/finance-access.js';
import {
  FINANCE_APPROVE,
  FINANCE_READ,
  FINANCE_READ_INDIVIDUAL,
  FINANCE_WRITE,
} from '../../finance.permissions.js';

const read = Permission.of(FINANCE_READ);
const write = Permission.of(FINANCE_WRITE);
const approve = Permission.of(FINANCE_APPROVE);
const readIndividual = Permission.of(FINANCE_READ_INDIVIDUAL);

function congregationsOf(
  policy: AccessPolicy,
  permission: Permission,
): readonly CongregationId[] | null {
  const scope = policy.scopeFor(permission);
  switch (scope.kind) {
    case 'ORGANIZATION':
      return null;
    case 'CONGREGATIONS':
      return scope.congregationIds;
    case 'NONE':
      return [];
  }
}

/**
 * Traduz a política de acesso do usuário (do `identity-access`) para o que os casos de uso de `finance` precisam saber.
 * É a ÚNICA ponte entre os dois módulos: os casos de uso não conhecem papéis nem permissões.
 */
export function financeAccessFrom(policy: AccessPolicy): FinanceAccess {
  return {
    readableCongregations: () => congregationsOf(policy, read),
    canRead: (congregationId) => policy.can(read, congregationId),
    canWrite: (congregationId) => policy.can(write, congregationId),
    individualCongregations: () => congregationsOf(policy, readIndividual),
    canReadIndividual: (congregationId) =>
      policy.can(readIndividual, congregationId),
    // Aprovar é decisão da SEDE: o alcance de quem aprova precisa incluir a sede (ADR 0015, item 4).
    canApprove: (headquarters) => policy.can(approve, headquarters),
    canManageCategories: () => policy.hasOrganizationWide(write),
  };
}
