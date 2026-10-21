/**
 * API pública do módulo `identity-access` (ADR 0001): a única porta de entrada para fora do módulo.
 * Entidades, repositórios e adaptadores não são exportados.
 *
 * - `IdentityAccessModule`: ligação no `AppModule`.
 * - `CreateAdministratorUseCase`, `createAdministratorCommand` e `PasswordReader`: usados pelo comando do operador
 *   (`src/cli.ts`).
 *
 * A camada HTTP (login, guard) ainda vai exportar os casos de uso de que precisar.
 */
export { CreateAdministratorUseCase } from './application/create-administrator.use-case.js';
export { IdentityAccessModule } from './identity-access.module.js';
export {
  createAdministratorCommand,
  type PasswordReader,
} from './presentation/cli/create-administrator.command.js';
