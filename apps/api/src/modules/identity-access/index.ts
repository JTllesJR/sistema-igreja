/**
 * API pública do módulo `identity-access` (ADR 0001): a única porta de entrada para fora do módulo.
 * Entidades, repositórios e adaptadores não são exportados.
 *
 * - `IdentityAccessModule`: ligação no `AppModule`.
 *
 * O comando do operador (criar o primeiro administrador) e a camada HTTP (login, guard) ainda vão exportar os
 * casos de uso de que precisarem.
 */
export { IdentityAccessModule } from './identity-access.module.js';
