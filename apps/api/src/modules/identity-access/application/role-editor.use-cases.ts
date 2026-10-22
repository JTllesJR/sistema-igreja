import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { PermissionDefinition } from '../../../shared/application/permission-definition.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { RoleInUseError, RoleNotFoundError } from '../domain/errors.js';
import { RoleId } from '../domain/ids.js';
import { Permission } from '../domain/permission.js';
import { RESERVED_PERMISSIONS, Role } from '../domain/role.js';
import type { RoleRepository } from '../domain/role.repository.js';
import { RoleName } from '../domain/role-name.js';
import type { UserRepository } from '../domain/user.repository.js';
import { type RoleView, toRoleView } from './views.js';

/*
 * Editor de papéis (UC-02, ADR 0019). Só o Administrador chega aqui (a rota exige `access:manage-users` na igreja toda).
 * As regras de um papel personalizado moram no domínio (`Role.custom`); aqui fica o que depende de fora dele: o catálogo
 * de permissões que existem e as atribuições dos usuários. Toda mudança vale na hora, porque as permissões são lidas do
 * banco a cada requisição, e é gravada na trilha DEPOIS de salva, como as outras ações administrativas (ADR 0014).
 */

/** As permissões que um papel personalizado pode receber, na ordem do catálogo. */
export function selectablePermissions(
  catalog: readonly PermissionDefinition[],
): PermissionDefinition[] {
  return catalog.filter(
    (definition) => !RESERVED_PERMISSIONS.includes(definition.key),
  );
}

/** Converte o pedido em permissões, recusando o que não existe no sistema (um erro de digitação viraria papel inútil). */
function permissionsFrom(
  catalog: readonly PermissionDefinition[],
  raw: readonly string[],
): Permission[] {
  const known = new Set(catalog.map((definition) => definition.key));
  const unknown = raw.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    throw new ValidationError(
      'permissions',
      `Permissão inexistente: ${unknown.join(', ')}.`,
    );
  }
  return raw.map((key) => Permission.of(key));
}

async function loadRoleOfOrganization(
  roles: RoleRepository,
  context: RequestContext,
  roleId: string,
): Promise<Role> {
  const [role] = await roles.findByIds([RoleId.of(roleId)]);
  if (!role || role.organizationId !== context.organizationId) {
    throw new RoleNotFoundError();
  }
  return role;
}

export interface CreateRoleCommand {
  name: string;
  permissions: string[];
}

export class CreateRoleUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly ids: IdGenerator,
    private readonly catalog: readonly PermissionDefinition[],
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    command: CreateRoleCommand,
  ): Promise<RoleView> {
    const role = Role.custom({
      id: RoleId.of(this.ids.next()),
      organizationId: context.organizationId,
      name: RoleName.create(command.name),
      permissions: permissionsFrom(this.catalog, command.permissions),
    });
    await this.roles.add(role);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'role.created',
      entity: 'role',
      entityId: role.id,
      metadata: { permissions: role.permissions.map((p) => p.value).join(',') },
    });
    return toRoleView(role);
  }
}

/** Campo ausente = manter. */
export interface UpdateRoleCommand {
  roleId: string;
  name?: string;
  permissions?: string[];
}

export class UpdateRoleUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly catalog: readonly PermissionDefinition[],
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    command: UpdateRoleCommand,
  ): Promise<RoleView> {
    const current = await loadRoleOfOrganization(
      this.roles,
      context,
      command.roleId,
    );
    const edited = current.edit({
      ...(command.name === undefined
        ? {}
        : { name: RoleName.create(command.name) }),
      ...(command.permissions === undefined
        ? {}
        : { permissions: permissionsFrom(this.catalog, command.permissions) }),
    });
    await this.roles.save(edited);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'role.updated',
      entity: 'role',
      entityId: edited.id,
      metadata: {
        renamed: edited.name.value !== current.name.value,
        permissions: edited.permissions.map((p) => p.value).join(','),
      },
    });
    return toRoleView(edited);
  }
}

export class DeleteRoleUseCase {
  constructor(
    private readonly roles: RoleRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(context: RequestContext, roleId: string): Promise<void> {
    const role = await loadRoleOfOrganization(this.roles, context, roleId);
    role.assertDeletable();

    // Confere antes para dar o erro certo; se alguém atribuir o papel no meio do caminho, o banco recusa (ADR 0019).
    // shortcut: lê todos os usuários da igreja, troque por uma contagem no repositório se passar de alguns milhares.
    const assigned = (
      await this.users.listByOrganization(context.organizationId)
    ).some((user) => user.assignments.some((a) => a.roleId === role.id));
    if (assigned) throw new RoleInUseError();

    await this.roles.remove(context.organizationId, role.id);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'role.deleted',
      entity: 'role',
      entityId: role.id,
      metadata: {},
    });
  }
}
