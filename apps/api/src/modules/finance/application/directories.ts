import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import type { MemberRef } from '../domain/ledger-entry.js';

/**
 * Porta para saber da congregação sem tocar nas tabelas do módulo `organization` (ADR 0001). A implementação usa a API
 * pública dele. `null` = não existe NESTA igreja (inclusive se for de outra).
 */
export interface CongregationDirectory {
  statusOf(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<'ACTIVE' | 'INACTIVE' | null>;
  /** A sede da igreja, ou `null` se ainda não há. */
  headquartersOf(
    organizationId: OrganizationId,
  ): Promise<CongregationId | null>;
}

/** O mínimo de um membro que o financeiro precisa: nome e congregação. Sem contato, sem endereço (ADR 0006). */
export interface MemberInfo {
  id: MemberRef;
  fullName: string;
  congregationId: CongregationId;
}

/**
 * Porta para o módulo `members` (ADR 0001): o financeiro guarda só o id do membro e pergunta por aqui. Nunca devolve
 * membro anonimizado, e toda consulta é da igreja do contexto.
 */
export interface MemberDirectory {
  find(
    organizationId: OrganizationId,
    id: MemberRef,
  ): Promise<MemberInfo | null>;
  findMany(
    organizationId: OrganizationId,
    ids: readonly MemberRef[],
  ): Promise<MemberInfo[]>;
  /** Busca por parte do nome (já normalizada), só nas congregações dadas (`null` = todas), ordenada por nome. */
  search(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      term: string | null;
      limit: number;
    },
  ): Promise<MemberInfo[]>;
}
