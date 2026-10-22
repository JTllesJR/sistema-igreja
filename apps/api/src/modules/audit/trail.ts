/**
 * Segundo ponto de entrada PÚBLICO do módulo `audit` (ADR 0001 e 0017): a consulta à trilha.
 *
 * Fica separado de `index.ts` de propósito. O `index.ts` é importado pelo `identity-access` (para gravar na trilha) e a
 * consulta importa o `identity-access` (para a política de acesso): juntos, formariam um ciclo de importações.
 *
 * - `AuditTrailModule`: ligação no `AppModule`.
 * - `AUDIT_READ`: a permissão da consulta (ADR 0004), para os papéis usarem.
 */
export { AuditTrailModule } from './audit-trail.module.js';
export { AUDIT_READ } from './audit.permissions.js';
