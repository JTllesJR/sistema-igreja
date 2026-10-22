import type { RequestContext } from '../../../shared/application/request-context.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import { type UserSummaryView, toUserSummaryView } from './views.js';

/** Lista os usuários da igreja (em ordem de e-mail) com seus papéis e escopos, para a tela de administração. */
export class ListUsersUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async execute(context: RequestContext): Promise<UserSummaryView[]> {
    const [users, roles] = await Promise.all([
      this.users.listByOrganization(context.organizationId),
      this.roles.listByOrganization(context.organizationId),
    ]);

    return users
      .map((user) => toUserSummaryView(user, roles))
      .sort((a, b) => a.email.localeCompare(b.email));
  }
}
