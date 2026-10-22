import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';

/**
 * Porta para perguntar ao módulo `organization` se uma igreja existe. O `identity-access` não consulta as tabelas
 * do outro módulo (ADR 0001): a implementação usa a API pública do `organization` (ADR 0009, seção 8).
 */
export interface OrganizationDirectory {
  exists(organizationId: OrganizationId): Promise<boolean>;

  /** A congregação existe NESTA igreja e está ativa? Congregação de outra igreja conta como inexistente. */
  isCongregationActive(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<boolean>;
}
