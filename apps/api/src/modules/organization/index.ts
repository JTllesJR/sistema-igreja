/**
 * API pública do módulo `organization` (ADR 0001): é a única porta de entrada para fora do módulo.
 * Entidades e repositório não são exportados.
 *
 * - `OrganizationModule`: ligação no `AppModule`.
 * - `CreateOrganizationUseCase` e `createOrganizationCommand`: usados pelo comando do operador (`src/cli.ts`, UC-17).
 *
 * (As consultas somente-leitura para outros módulos, ADR 0009 seção 8, entram quando houver o primeiro consumidor.)
 */
export { CreateOrganizationUseCase } from './application/create-organization.use-case.js';
export { OrganizationModule } from './organization.module.js';
export { createOrganizationCommand } from './presentation/cli/create-organization.command.js';
