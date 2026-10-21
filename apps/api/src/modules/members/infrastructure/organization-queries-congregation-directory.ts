import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
// Só a API pública do módulo `organization` (ADR 0001): nunca suas tabelas nem suas entidades.
import type { OrganizationQueries } from '../../organization/index.js';
import type { CongregationDirectory } from '../application/congregation-directory.js';

/**
 * Adaptador (anti-corrupção): traduz a porta que o `members` precisa (`CongregationDirectory`) para a API pública que o
 * `organization` oferece. O isolamento entre igrejas é garantido pela própria consulta (id de outra igreja não acha nada).
 */
export class OrganizationQueriesCongregationDirectory implements CongregationDirectory {
  constructor(private readonly queries: OrganizationQueries) {}

  async statusOf(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<'ACTIVE' | 'INACTIVE' | null> {
    const congregation = await this.queries.findCongregation(
      organizationId,
      congregationId,
    );
    return congregation?.status ?? null;
  }
}
