import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { RoleId } from '../domain/ids.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { RoleAssignmentCommand } from './assign-role.use-case.js';
import { loadUserOfOrganization } from './load-user.js';
import { updateUser } from './update-user.js';
import { type UserSummaryView, toUserSummaryView } from './views.js';

/**
 * Revoga uma atribuição (papel + escopo) de um usuário da igreja.
 *
 * Se o usuário é um Administrador ativo, a gravação é a protegida: a igreja nunca fica sem Administrador ativo
 * (ADR 0014), nem quando dois administradores se removem ao mesmo tempo. Numa igreja sem nenhum administrador
 * (estado anormal) a regra não se aplica: ela só barra quem TIRA o último.
 */
export class RevokeRoleUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    command: RoleAssignmentCommand,
  ): Promise<UserSummaryView> {
    const target = await loadUserOfOrganization(
      this.users,
      context,
      command.userId,
    );
    const roleId = RoleId.of(command.roleId);
    const congregationId =
      command.congregationId === null
        ? null
        : CongregationId.of(command.congregationId);

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
      (user) => user.revokeRole(roleId, congregationId),
      guardedRoleId
        ? (user) =>
            this.users.saveGuardingLastAdministrator(user, guardedRoleId)
        : undefined,
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'user.role_revoked',
      entity: 'user',
      entityId: updated.id,
      metadata: { roleId, congregationId },
    });

    return toUserSummaryView(
      updated,
      await this.roles.listByOrganization(context.organizationId),
    );
  }
}
