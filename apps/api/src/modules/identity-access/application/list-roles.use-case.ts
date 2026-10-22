import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import type { RoleRepository } from '../domain/role.repository.js';
import { ensureDefaultRoles } from './default-roles.js';
import { type RoleView, toRoleView } from './views.js';

/**
 * Lista os papéis da igreja, em ordem alfabética do português. Garante antes que os papéis padrão existam: assim uma
 * igreja criada antes deles (ADR 0014) os ganha na primeira consulta, sem migration de dados.
 */
export class ListRolesUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(context: RequestContext): Promise<RoleView[]> {
    await ensureDefaultRoles(this.roles, this.ids, context.organizationId);

    const roles = await this.roles.listByOrganization(context.organizationId);
    return roles
      .map(toRoleView)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
}
