import type { CongregationId } from '../../../shared/domain/identifiers.js';

/**
 * O que o usuário pode fazer com membros, JÁ resolvido a partir das permissões dele (ADR 0004). A camada de apresentação
 * monta isto a partir da política de acesso; assim os casos de uso decidem por escopo sem conhecer papéis nem o módulo
 * `identity-access`.
 *
 * Ler e escrever são permissões DIFERENTES: um papel pode ver os membros de uma congregação sem poder alterá-los.
 */
export interface MemberAccess {
  /** Congregações cujos membros o usuário pode VER. `null` = a igreja toda. Lista vazia = nenhuma. */
  readableCongregations(): readonly CongregationId[] | null;
  canRead(congregationId: CongregationId): boolean;
  /** Pode cadastrar, alterar e transferir membros DESTA congregação? */
  canWrite(congregationId: CongregationId): boolean;
  /** Pode apagar os dados pessoais de um membro? Exige a igreja toda: é uma decisão da liderança, e irreversível. */
  canAnonymize(): boolean;
}
