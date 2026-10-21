import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';

/**
 * Porta para saber da congregação sem tocar nas tabelas do módulo `organization` (ADR 0001). A implementação usa a API
 * pública dele. `null` = não existe NESTA igreja (inclusive se for de outra).
 */
export interface CongregationDirectory {
  statusOf(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<'ACTIVE' | 'INACTIVE' | null>;
}
