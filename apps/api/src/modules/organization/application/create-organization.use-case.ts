import type { AddressInput } from '../../../shared/domain/address.js';
import { CongregationName } from '../domain/congregation-name.js';
import { CongregationId, OrganizationId } from '../domain/ids.js';
import { Organization } from '../domain/organization.js';
import { OrganizationName } from '../domain/organization-name.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import { type ServiceTimeInput, toAddress, toServiceTimes } from './inputs.js';

export interface CreateOrganizationCommand {
  name: string;
  headquarters: {
    name: string;
    address?: AddressInput | null;
    serviceTimes?: ServiceTimeInput[];
  };
}

export interface CreateOrganizationResult {
  organizationId: OrganizationId;
  headquartersId: CongregationId;
}

/**
 * UC-17: cria uma igreja já com sua sede. Executado pelo operador (linha de comando).
 *
 * Única exceção à regra "todo caso de uso recebe um contexto" (ADR 0009): aqui o tenant ainda não existe,
 * é ele que está sendo criado. Por isso não há endpoint público para isto.
 */
export class CreateOrganizationUseCase {
  constructor(
    private readonly repository: OrganizationRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    command: CreateOrganizationCommand,
  ): Promise<CreateOrganizationResult> {
    const organization = Organization.create({
      id: OrganizationId.of(this.ids.next()),
      name: OrganizationName.create(command.name),
      headquarters: {
        id: CongregationId.of(this.ids.next()),
        name: CongregationName.create(command.headquarters.name),
        address: toAddress(command.headquarters.address),
        serviceTimes: toServiceTimes(command.headquarters.serviceTimes),
      },
    });

    await this.repository.add(organization);

    return {
      organizationId: organization.id,
      headquartersId: organization.headquarters.id,
    };
  }
}
