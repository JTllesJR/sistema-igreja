import type { RequestContext } from '../../../shared/application/request-context.js';
import { comparisonKey } from '../../../shared/domain/text.js';
import type { CongregationStatus } from '../domain/congregation.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { loadOrganization } from './load-organization.js';
import { type CongregationView, toCongregationView } from './views.js';

export interface ListCongregationsQuery {
  status?: CongregationStatus;
}

export class ListCongregationsUseCase {
  constructor(private readonly repository: OrganizationRepository) {}

  /** Ordenada por nome ignorando caixa e acentos ("água" vem antes de "Bela"). */
  async execute(
    context: RequestContext,
    query: ListCongregationsQuery,
  ): Promise<CongregationView[]> {
    const organization = await loadOrganization(this.repository, context);

    return organization.congregations
      .filter((c) => query.status === undefined || c.status === query.status)
      .toSorted((a, b) =>
        comparisonKey(a.name.value).localeCompare(comparisonKey(b.name.value)),
      )
      .map(toCongregationView);
  }
}
