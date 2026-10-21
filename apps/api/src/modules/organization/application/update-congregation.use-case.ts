import type { RequestContext } from '../../../shared/application/request-context.js';
import type { AddressInput } from '../domain/address.js';
import { CongregationName } from '../domain/congregation-name.js';
import { CongregationId } from '../domain/ids.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { type ServiceTimeInput, toAddress, toServiceTimes } from './inputs.js';
import { loadOrganization } from './load-organization.js';
import { type CongregationView, toCongregationView } from './views.js';

/** Campos ausentes (`undefined`) permanecem como estão; `address: null` remove o endereço. */
export interface UpdateCongregationCommand {
  congregationId: string;
  name?: string;
  address?: AddressInput | null;
  serviceTimes?: ServiceTimeInput[];
}

export class UpdateCongregationUseCase {
  constructor(private readonly repository: OrganizationRepository) {}

  async execute(
    context: RequestContext,
    command: UpdateCongregationCommand,
  ): Promise<CongregationView> {
    const organization = await loadOrganization(this.repository, context);

    const updated = organization.updateCongregation(
      CongregationId.of(command.congregationId),
      {
        name:
          command.name === undefined
            ? undefined
            : CongregationName.create(command.name),
        address: toAddress(command.address),
        serviceTimes: toServiceTimes(command.serviceTimes),
      },
    );
    await this.repository.save(organization);

    return toCongregationView(updated);
  }
}
