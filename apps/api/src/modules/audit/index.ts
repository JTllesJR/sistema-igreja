/**
 * API pública do módulo `audit` (ADR 0001): a trilha de auditoria somente-anexação (RN-04, ADR 0006).
 *
 * - `AuditModule`: importe no módulo que audita; ele exporta `AUDIT_LOG`.
 * - `AUDIT_LOG`: token para injetar a porta `AuditLog` (definida em `shared/application/audit-log.ts`).
 */
export { AuditModule } from './audit.module.js';
export { AUDIT_LOG } from './audit.tokens.js';
export { AUDIT_PERMISSIONS } from './audit.permissions.js';
