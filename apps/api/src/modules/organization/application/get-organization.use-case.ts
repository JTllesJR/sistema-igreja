import type { RequestContext } from '../../../shared/application/request-context.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { loadOrganization } from './load-organization.js';
import { type OrganizationView, toOrganizationView } from './views.js';

export class GetOrganizationUseCase {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(context: RequestContext): Promise<OrganizationView> {
    return toOrganizationView(await loadOrganization(this.repository, context));
  }
}
