import type { OrganizationId } from '../../../shared/domain/identifiers.js';

/**
 * Consultas SOMENTE-LEITURA que o módulo `organization` oferece aos outros (ADR 0009, seção 8). Os outros módulos
 * guardam só ids e perguntam por aqui, nunca nas tabelas do `organization` (ADR 0001).
 *
 * Entra apenas o que já tem consumidor: `congregationExists` e `listCongregationIds` chegam com os módulos
 * que precisarem deles (`members`, escopo de papéis por congregação).
 */
export interface OrganizationQueries {
  organizationExists(organizationId: OrganizationId): Promise<boolean>;
}
