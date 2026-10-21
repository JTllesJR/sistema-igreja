/**
 * API pública do módulo `members` (ADR 0001): a única porta de entrada para fora do módulo. Entidades e repositório
 * não são exportados.
 *
 * - `MembersModule`: ligação no `AppModule`.
 * - `MEMBERS_READ`, `MEMBERS_WRITE`, `MEMBERS_ANONYMIZE`: as permissões do módulo (ADR 0004), para os papéis usarem.
 *
 * Os dados de membros são SENSÍVEIS (ADR 0006): nenhum outro módulo os lê diretamente.
 */
export { MembersModule } from './members.module.js';
export {
  MEMBERS_ANONYMIZE,
  MEMBERS_READ,
  MEMBERS_WRITE,
} from './members.permissions.js';
