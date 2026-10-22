/**
 * API pública do módulo `organization` (ADR 0001): é a única porta de entrada para fora do módulo.
 * Entidades e repositório não são exportados.
 *
 * - `OrganizationModule`: ligação no `AppModule`.
 * - `CreateOrganizationUseCase` e `createOrganizationCommand`: usados pelo comando do operador (`src/cli.ts`, UC-17).
 * - `ORGANIZATION_QUERIES` e `OrganizationQueries`: consultas somente-leitura para OUTROS módulos (ADR 0009, seção 8).
 *   Hoje só `organizationExists`, usada pelo `identity-access`; o resto entra com os próximos consumidores.
 */
export type {
  CongregationSummary,
  OrganizationQueries,
} from './application/organization-queries.js';
export { CreateOrganizationUseCase } from './application/create-organization.use-case.js';
export { ORGANIZATION_QUERIES } from './organization.tokens.js';
export { OrganizationModule } from './organization.module.js';
export { createOrganizationCommand } from './presentation/cli/create-organization.command.js';
export { ORGANIZATION_PERMISSIONS } from './organization.permissions.js';
