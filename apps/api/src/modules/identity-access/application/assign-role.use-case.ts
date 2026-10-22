import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { RoleId, UserId } from '../domain/ids.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import { loadUserOfOrganization } from './load-user.js';
import type { OrganizationDirectory } from './organization-directory.js';
import { resolveAssignableRole } from './resolve-assignable-role.js';
import { updateUser } from './update-user.js';
import { type UserSummaryView, toUserSummaryView } from './views.js';

/** Atribuir ou revogar um papel. `congregationId` nulo = a igreja toda. */
export interface RoleAssignmentCommand {
  userId: string;
  roleId: string;
  congregationId: string | null;
}

/**
 * Atribui um papel a um usuário da igreja, para a igreja toda ou para UMA congregação ativa (UC-03, versão enxuta do
 * ADR 0014). Vale na hora: as permissões são lidas do banco a cada requisição.
 *
 * O Administrador só vale para a igreja toda. Usuário, papel e congregação de outra igreja são tratados como
 * inexistentes, sem revelar qual dos casos ocorreu (ADR 0003).
 */
export class AssignRoleUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly organizations: OrganizationDirectory,
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

    await resolveAssignableRole(
      this.roles,
      this.organizations,
      context,
      roleId,
      congregationId,
    );

    const updated = await updateUser(this.users, UserId.of(target.id), (user) =>
      user.assignRole(roleId, congregationId),
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'user.role_assigned',
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
