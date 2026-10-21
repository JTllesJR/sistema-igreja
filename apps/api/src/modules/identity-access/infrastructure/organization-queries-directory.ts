import type { OrganizationId } from '../../../shared/domain/identifiers.js';
// Só a API pública do módulo `organization` (ADR 0001): nunca suas tabelas nem suas entidades.
import type { OrganizationQueries } from '../../organization/index.js';
import type { OrganizationDirectory } from '../application/organization-directory.js';

/**
 * Adaptador (anti-corrupção): traduz a porta que o `identity-access` precisa (`OrganizationDirectory`) para a API
 * pública que o `organization` oferece (`OrganizationQueries`). Se o `organization` mudar, só este arquivo muda.
 */
export class OrganizationQueriesDirectory implements OrganizationDirectory {
  constructor(private readonly queries: OrganizationQueries) {}

  exists(organizationId: OrganizationId): Promise<boolean> {
    return this.queries.organizationExists(organizationId);
  }
}
