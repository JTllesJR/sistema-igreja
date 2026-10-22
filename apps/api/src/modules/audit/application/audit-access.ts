/**
 * O que o usuário pode fazer com a trilha, JÁ resolvido a partir das permissões dele (ADR 0004). A apresentação monta
 * isto da política de acesso; o caso de uso não conhece papéis. É uma segunda trava além da rota: se alguém esquecer o
 * `@RequirePermission`, o caso de uso ainda recusa.
 */
export interface AuditAccess {
  /** Pode consultar a trilha da igreja toda? (`audit:read` na igreja toda.) */
  canRead(): boolean;
}
