import type { RequestContext } from '../../../shared/application/request-context.js';
import type { AddressInput } from '../../../shared/domain/address.js';
import { CongregationName } from '../domain/congregation-name.js';
import { CongregationId } from '../domain/ids.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import { type ServiceTimeInput, toAddress, toServiceTimes } from './inputs.js';
import { loadOrganization } from './load-organization.js';
import { type CongregationView, toCongregationView } from './views.js';

export interface RegisterCongregationCommand {
  name: string;
  address?: AddressInput | null;
  serviceTimes?: ServiceTimeInput[];
}

export class RegisterCongregationUseCase {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    context: RequestContext,
    command: RegisterCongregationCommand,
  ): Promise<CongregationView> {
    const organization = await loadOrganization(this.repository, context);

    const congregation = organization.registerCongregation({
      id: CongregationId.of(this.ids.next()),
      name: CongregationName.create(command.name),
      address: toAddress(command.address),
      serviceTimes: toServiceTimes(command.serviceTimes),
    });
    await this.repository.save(organization);

    return toCongregationView(congregation);
  }
}
