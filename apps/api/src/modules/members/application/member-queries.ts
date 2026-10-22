import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import { comparisonKey } from '../../../shared/domain/text.js';
import { MemberId } from '../domain/ids.js';
import type { MemberRepository } from '../domain/member.repository.js';

/** O mínimo de um membro que OUTROS módulos podem ver: quem é e onde congrega. Sem contato, endereço nem nascimento. */
export interface MemberBrief {
  id: string;
  fullName: string;
  congregationId: CongregationId;
}

/**
 * API pública do módulo `members` para os outros (ADR 0001 e 0015): consultas SOMENTE-LEITURA e mínimas. O financeiro
 * guarda só o id do membro e pergunta por aqui; nunca lê as tabelas de `members`. Membro anonimizado nunca aparece.
 * Quem chama é responsável por auditar a leitura (esta consulta revela nomes).
 */
export interface MemberQueries {
  find(organizationId: OrganizationId, id: string): Promise<MemberBrief | null>;
  findMany(
    organizationId: OrganizationId,
    ids: readonly string[],
  ): Promise<MemberBrief[]>;
  /** `term` em texto comum ("josé"): a normalização (sem acento nem caixa) é feita aqui. `null` = todos. */
  search(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      term: string | null;
      limit: number;
    },
  ): Promise<MemberBrief[]>;
}

/** Implementação sobre o repositório do próprio módulo: não duplica nenhuma consulta. */
export class RepositoryMemberQueries implements MemberQueries {
  constructor(private readonly repository: MemberRepository) {}

  async find(
    organizationId: OrganizationId,
    id: string,
  ): Promise<MemberBrief | null> {
    return (await this.findMany(organizationId, [id]))[0] ?? null;
  }

  async findMany(
    organizationId: OrganizationId,
    ids: readonly string[],
  ): Promise<MemberBrief[]> {
    const summaries = await this.repository.findSummaries(
      organizationId,
      ids.map((id) => MemberId.of(id)),
    );
    return summaries.map(({ id, fullName, congregationId }) => ({
      id,
      fullName,
      congregationId,
    }));
  }

  async search(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      term: string | null;
      limit: number;
    },
  ): Promise<MemberBrief[]> {
    const page = await this.repository.search(organizationId, {
      congregationIds: criteria.congregationIds,
      term: criteria.term === null ? null : comparisonKey(criteria.term),
      status: null,
      limit: criteria.limit,
      offset: 0,
    });
    return page.items.map(({ id, fullName, congregationId }) => ({
      id,
      fullName,
      congregationId,
    }));
  }
}
