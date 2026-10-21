import type { CongregationId } from '../../../../shared/domain/identifiers.js';
// Só a API pública do módulo `identity-access` (ADR 0001).
import {
  type AccessPolicy,
  Permission,
} from '../../../identity-access/index.js';
import type { MemberAccess } from '../../application/member-access.js';
import {
  MEMBERS_ANONYMIZE,
  MEMBERS_READ,
  MEMBERS_WRITE,
} from '../../members.permissions.js';

const read = Permission.of(MEMBERS_READ);
const write = Permission.of(MEMBERS_WRITE);
const anonymize = Permission.of(MEMBERS_ANONYMIZE);

/**
 * Traduz a política de acesso do usuário (do `identity-access`) para o que os casos de uso de `members` precisam saber.
 * É a ÚNICA ponte entre os dois módulos: os casos de uso não conhecem papéis nem permissões.
 */
export function memberAccessFrom(policy: AccessPolicy): MemberAccess {
  return {
    readableCongregations(): readonly CongregationId[] | null {
      const scope = policy.scopeFor(read);
      switch (scope.kind) {
        case 'ORGANIZATION':
          return null;
        case 'CONGREGATIONS':
          return scope.congregationIds;
        case 'NONE':
          return [];
      }
    },
    canRead: (congregationId) => policy.can(read, congregationId),
    canWrite: (congregationId) => policy.can(write, congregationId),
    canAnonymize: () => policy.hasOrganizationWide(anonymize),
  };
}
