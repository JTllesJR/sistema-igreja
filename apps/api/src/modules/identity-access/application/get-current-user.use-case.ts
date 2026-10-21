import type { RequestContext } from '../../../shared/application/request-context.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import { loadActiveUser } from './load-user.js';
import { type CurrentUserView, toCurrentUserView } from './views.js';

export class GetCurrentUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
  ) {}

  async execute(context: RequestContext): Promise<CurrentUserView> {
    const user = await loadActiveUser(this.users, context);
    const roles = await this.roles.findByIds(
      user.assignments.map((a) => a.roleId),
    );

    return toCurrentUserView(user, roles);
  }
}
