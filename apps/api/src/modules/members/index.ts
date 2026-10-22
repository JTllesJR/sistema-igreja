/**
 * API pública do módulo `members` (ADR 0001): a única porta de entrada para fora do módulo. Entidades e repositório
 * não são exportados.
 *
 * - `MembersModule`: ligação no `AppModule`.
 * - `MEMBERS_READ`, `MEMBERS_WRITE`, `MEMBERS_ANONYMIZE`: as permissões do módulo (ADR 0004), para os papéis usarem.
 * - `MEMBER_QUERIES` e `MemberQueries`: consultas somente-leitura e MÍNIMAS (id, nome, congregação) para o `finance`
 *   (ADR 0015). Quem as usa audita a leitura.
 *
 * Os dados de membros são SENSÍVEIS (ADR 0006): nenhum outro módulo os lê diretamente.
 */
export type {
  MemberBrief,
  MemberQueries,
} from './application/member-queries.js';
export { MembersModule } from './members.module.js';
export { MEMBER_QUERIES } from './members.tokens.js';
export {
  MEMBERS_ANONYMIZE,
  MEMBERS_PERMISSIONS,
  MEMBERS_READ,
  MEMBERS_WRITE,
} from './members.permissions.js';
