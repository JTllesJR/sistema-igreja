import type { RequestContext } from '../../../shared/application/request-context.js';
import { OrganizationNotFoundError } from '../domain/errors.js';
import type { Organization } from '../domain/organization.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';

/**
 * Carrega a organização do contexto. É o único ponto de entrada de dados dos casos de uso:
 * como o id vem sempre de `context.organizationId`, é impossível alcançar outra igreja (ADR 0003).
 */
export async function loadOrganization(
  repository: OrganizationRepository,
  context: RequestContext,
): Promise<Organization> {
  const organization = await repository.findById(context.organizationId);
  if (!organization)
    throw new OrganizationNotFoundError(context.organizationId);
  return organization;
}
