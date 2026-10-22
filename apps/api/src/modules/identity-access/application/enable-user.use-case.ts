import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { UserCommand } from './disable-user.use-case.js';
import { loadUserOfOrganization } from './load-user.js';
import { updateUser } from './update-user.js';
import { type UserSummaryView, toUserSummaryView } from './views.js';

/** Reativa um usuário desativado. As sessões antigas continuam revogadas: ele entra de novo com a senha. */
export class EnableUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    command: UserCommand,
  ): Promise<UserSummaryView> {
    const target = await loadUserOfOrganization(
      this.users,
      context,
      command.userId,
    );

    const updated = await updateUser(this.users, target.id, (user) =>
      user.enable(),
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'user.enabled',
      entity: 'user',
      entityId: updated.id,
    });

    return toUserSummaryView(
      updated,
      await this.roles.listByOrganization(context.organizationId),
    );
  }
}
