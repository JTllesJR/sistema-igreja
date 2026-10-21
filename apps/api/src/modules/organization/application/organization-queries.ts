import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';

/**
 * Consultas SOMENTE-LEITURA que o módulo `organization` oferece aos outros (ADR 0009, seção 8). Os outros módulos
 * guardam só ids e perguntam por aqui, nunca nas tabelas do `organization` (ADR 0001).
 *
 * Entra apenas o que já tem consumidor.
 */
export interface OrganizationQueries {
  organizationExists(organizationId: OrganizationId): Promise<boolean>;

  /**
   * A congregação DESTA igreja, ou `null` se não existe nela (inclusive se existir em outra igreja: o isolamento é
   * garantido aqui, e quem chama não precisa filtrar de novo).
   */
  findCongregation(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<CongregationSummary | null>;
}

/** O mínimo que outros módulos precisam saber de uma congregação. */
export interface CongregationSummary {
  id: CongregationId;
  status: 'ACTIVE' | 'INACTIVE';
}
