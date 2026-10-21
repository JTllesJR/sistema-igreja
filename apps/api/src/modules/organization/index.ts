/**
 * API pública do módulo `organization` (ADR 0001): é a única porta de entrada para outros módulos.
 * Entidades, repositório e casos de uso internos não são exportados.
 * (As consultas somente-leitura para outros módulos, ADR 0009 seção 8, entram quando houver o primeiro consumidor.)
 */
export { OrganizationModule } from './organization.module.js';
