/**
 * API pública do módulo `identity-access` (ADR 0001): a única porta de entrada para fora do módulo.
 * Entidades, repositórios e adaptadores não são exportados.
 *
 * - `IdentityAccessModule`: ligação no `AppModule`.
 * - `CreateAdministratorUseCase`, `createAdministratorCommand` e `PasswordReader`: usados pelo comando do operador
 *   (`src/cli.ts`).
 *
 * - `CurrentPolicy`: a política de acesso do usuário logado, para o controller filtrar por escopo de congregação.
 * Quem protege rotas usa `@Public`, `@RequirePermission` e `@CurrentContext`, de `platform/http/access-control`.
 */
export { CreateAdministratorUseCase } from './application/create-administrator.use-case.js';
export { IdentityAccessModule } from './identity-access.module.js';
export {
  createAdministratorCommand,
  type PasswordReader,
} from './presentation/cli/create-administrator.command.js';
export { AccessPolicy } from './domain/access-policy.js';
export { CurrentPolicy } from './presentation/http/authenticated-request.js';
