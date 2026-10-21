import type { RequestContext } from '../../../shared/application/request-context.js';
import { CongregationId } from '../domain/ids.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { loadOrganization } from './load-organization.js';
import { type CongregationView, toCongregationView } from './views.js';

export interface CongregationCommand {
  congregationId: string;
}

export class DeactivateCongregationUseCase {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    context: RequestContext,
    command: CongregationCommand,
  ): Promise<CongregationView> {
    const organization = await loadOrganization(this.repository, context);

    const updated = organization.deactivateCongregation(
      CongregationId.of(command.congregationId),
    );
    await this.repository.save(organization);

    return toCongregationView(updated);
  }
}
