import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import type { MemberId } from './ids.js';
import type { Member } from './member.js';
import type { MemberHistoryEvent } from './member-history-event.js';
import type { MemberStatus } from './member-status.js';

/** O que a lista de membros mostra. Propositalmente SEM contato nem nascimento: o mínimo para achar a pessoa. */
export interface MemberSummary {
  id: MemberId;
  fullName: string;
  congregationId: CongregationId;
  status: MemberStatus;
}

export interface MemberSearchCriteria {
  /**
   * Em quais congregações procurar. `null` = a igreja toda; lista vazia = em nenhuma (resultado vazio). É assim que o
   * ESCOPO do usuário chega ao banco: a consulta nunca enxerga o que ele não pode ver (ADR 0004).
   */
  congregationIds: readonly CongregationId[] | null;
  /** Já normalizado (`comparisonKey`): sem acentos nem caixa. O repositório procura "contém". */
  term: string | null;
  status: MemberStatus | null;
  limit: number;
  offset: number;
}

export interface MemberPage {
  items: MemberSummary[];
  /** Quantos membros casam com a busca, ignorando a paginação. */
  total: number;
}

/**
 * Porta de persistência do agregado `Member`. TODA consulta é filtrada pela igreja (ADR 0003): não existe método que
 * receba só um id de membro.
 *
 * Contrato (verificado por `describeMemberRepositoryContract`):
 *  - `findById` devolve uma cópia independente e `null` para membro inexistente OU de outra igreja.
 *  - `add` grava o membro e seus eventos pendentes juntos.
 *  - `save` grava o agregado e seus eventos pendentes, com travamento otimista por `version`: falha com
 *    `ConcurrencyConflictError` se outra gravação ocorreu e com `MemberNotFoundError` se não existe. A cada gravação a
 *    versão guardada avança em 1. Se o membro foi anonimizado, apaga também as observações dos eventos antigos.
 *    Depois de `add`/`save`, carregue o membro de novo antes de alterá-lo outra vez.
 *  - `listHistory` devolve os eventos do mais recente para o mais antigo.
 *  - `search` ignora membros anonimizados, ordena por nome (sem acentos) e depois por id, e respeita a paginação.
 */
export interface MemberRepository {
  findById(
    organizationId: OrganizationId,
    id: MemberId,
  ): Promise<Member | null>;
  listHistory(
    organizationId: OrganizationId,
    id: MemberId,
  ): Promise<MemberHistoryEvent[]>;
  add(member: Member): Promise<void>;
  save(member: Member): Promise<void>;
  search(
    organizationId: OrganizationId,
    criteria: MemberSearchCriteria,
  ): Promise<MemberPage>;
}
