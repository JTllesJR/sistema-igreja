import { DomainError } from '../../../shared/domain/domain-error.js';

/** Consultar a trilha exige `audit:read` para a igreja toda. */
export class AuditAccessDeniedError extends DomainError {
  constructor() {
    super(
      'audit.access_denied',
      'Você não tem permissão para consultar a trilha de auditoria.',
    );
  }
}
