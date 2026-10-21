import type { AddressPrimitives } from '../domain/address.js';
import type {
  Congregation,
  CongregationStatus,
} from '../domain/congregation.js';
import type { Organization } from '../domain/organization.js';
import type { ServiceTimePrimitives } from '../domain/service-time.js';

/**
 * Visões de leitura: dados simples devolvidos pelos casos de uso.
 * A camada de apresentação (HTTP) recebe isto, e não objetos de domínio; assim o domínio pode evoluir
 * sem mudar o contrato externo, e ninguém de fora consegue chamar métodos do agregado.
 */
export interface OrganizationView {
  id: string;
  name: string;
}

export interface CongregationView {
  id: string;
  name: string;
  isHeadquarters: boolean;
  status: CongregationStatus;
  address: AddressPrimitives | null;
  serviceTimes: ServiceTimePrimitives[];
}

export function toOrganizationView(
  organization: Organization,
): OrganizationView {
  return { id: organization.id, name: organization.name.value };
}

export function toCongregationView(
  congregation: Congregation,
): CongregationView {
  return {
    id: congregation.id,
    name: congregation.name.value,
    isHeadquarters: congregation.isHeadquarters,
    status: congregation.status,
    address: congregation.address?.toPrimitives() ?? null,
    serviceTimes: congregation.serviceTimes.map((s) => s.toPrimitives()),
  };
}
