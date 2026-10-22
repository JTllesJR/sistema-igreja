import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import { loadUserOfOrganization } from './load-user.js';
import { updateUser } from './update-user.js';
import { type UserSummaryView, toUserSummaryView } from './views.js';

export interface UserCommand {
  userId: string;
}

/**
 * Desativa um usuário da igreja e derruba todas as sessões dele: o acesso acaba na hora, mesmo com token ainda dentro
 * do prazo (o guard confere a situação a cada requisição). Desativar o último Administrador ativo é recusado
 * (ADR 0014); nesse caso nada muda, nem as sessões.
 */
export class DisableUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
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

    const administrator = await this.roles.findAdministrator(
      context.organizationId,
    );
    const guardedRoleId =
      administrator && target.isActiveAdministrator(administrator.id)
        ? administrator.id
        : null;

    const updated = await updateUser(
      this.users,
      target.id,
      (user) => user.disable(),
      guardedRoleId
        ? (user) =>
            this.users.saveGuardingLastAdministrator(user, guardedRoleId)
        : undefined,
    );
    await this.sessions.revokeAllForUser(updated.id, this.clock.now());

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'user.disabled',
      entity: 'user',
      entityId: updated.id,
    });

    return toUserSummaryView(
      updated,
      await this.roles.listByOrganization(context.organizationId),
    );
  }
}
