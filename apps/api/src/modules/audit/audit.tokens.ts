/** Token de injeção da trilha de auditoria (a interface `AuditLog` vive em `shared/application`). */
export const AUDIT_LOG = Symbol('AuditLog');
/** Token da porta de CONSULTA à trilha (usado só pelo `AuditTrailModule` e pelos testes). */
export const AUDIT_QUERY_REPOSITORY = Symbol('AuditQueryRepository');
