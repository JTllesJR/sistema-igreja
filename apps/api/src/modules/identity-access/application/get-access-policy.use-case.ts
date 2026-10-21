import type { RequestContext } from '../../../shared/application/request-context.js';
import { AccessPolicy } from '../domain/access-policy.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import { loadActiveUser } from './load-user.js';

/**
 * Monta o que o usuário pode fazer, a partir das atribuições atuais (lidas do banco a cada chamada, então
 * mudanças de papel valem na hora). É o que o guard da camada HTTP consulta a cada requisição (ADR 0004 e 0010).
 */
export class GetAccessPolicyUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async execute(context: RequestContext): Promise<AccessPolicy> {
    const user = await loadActiveUser(this.users, context);
    const roles = await this.roles.findByIds(
      user.assignments.map((a) => a.roleId),
    );

    return AccessPolicy.from(user.assignments, roles);
  }
}
