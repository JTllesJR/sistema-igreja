import type { RequestContext } from '../../../shared/application/request-context.js';
import { OrganizationName } from '../domain/organization-name.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { loadOrganization } from './load-organization.js';
import { type OrganizationView, toOrganizationView } from './views.js';

export interface RenameOrganizationCommand {
  name: string;
}

export class RenameOrganizationUseCase {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    context: RequestContext,
    command: RenameOrganizationCommand,
  ): Promise<OrganizationView> {
    const organization = await loadOrganization(this.repository, context);

    organization.rename(OrganizationName.create(command.name));
    await this.repository.save(organization);

    return toOrganizationView(organization);
  }
}
