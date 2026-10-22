// Só a API pública do módulo `identity-access` (ADR 0001).
import {
  type AccessPolicy,
  Permission,
} from '../../../identity-access/index.js';
import type { AuditAccess } from '../../application/audit-access.js';
import { AUDIT_READ } from '../../audit.permissions.js';

const read = Permission.of(AUDIT_READ);

/**
 * Traduz a política de acesso do usuário (do `identity-access`) para o que o caso de uso da trilha precisa saber. A
 * trilha é da igreja toda: `audit:read` por congregação NÃO basta.
 */
export function auditAccessFrom(policy: AccessPolicy): AuditAccess {
  return { canRead: () => policy.hasOrganizationWide(read) };
}
