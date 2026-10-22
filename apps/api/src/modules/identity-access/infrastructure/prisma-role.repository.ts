import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { RoleNameAlreadyInUseError } from '../domain/errors.js';
import { RoleId } from '../domain/ids.js';
import { Permission } from '../domain/permission.js';
import { ADMINISTRATOR_ROLE_NAME, Role } from '../domain/role.js';
import type { RoleRepository } from '../domain/role.repository.js';
import { RoleName } from '../domain/role-name.js';

type RoleRow = Prisma.RoleGetPayload<{ include: { permissions: true } }>;

export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIds(ids: readonly RoleId[]): Promise<Role[]> {
    if (ids.length === 0) return [];

    const rows = await this.prisma.role.findMany({
      where: { id: { in: [...ids] } },
      include: { permissions: true },
    });
    return rows.map(toDomain);
  }

  async findAdministrator(
    organizationId: OrganizationId,
  ): Promise<Role | null> {
    const row = await this.prisma.role.findFirst({
      where: { organizationId, isSystem: true, name: ADMINISTRATOR_ROLE_NAME },
      include: { permissions: true },
    });
    return row ? toDomain(row) : null;
  }

  async listByOrganization(organizationId: OrganizationId): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({
      where: { organizationId },
      include: { permissions: true },
    });
    return rows.map(toDomain);
  }

  async add(role: Role): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.role.create({
          data: {
            id: role.id,
            organizationId: role.organizationId,
            name: role.name.value,
            isSystem: role.isSystem,
          },
        });
      } catch (error) {
        // Índice único (organization_id, lower(name)): o nome do papel já existe nesta igreja.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new RoleNameAlreadyInUseError(role.name.value);
        }
        throw error;
      }

      await tx.rolePermission.createMany({
        data: role.permissions.map((permission) => ({
          roleId: role.id,
          permission: permission.value,
        })),
      });
    });
  }
}

function toDomain(row: RoleRow): Role {
  return Role.restore({
    id: RoleId.of(row.id),
    organizationId: OrganizationId.of(row.organizationId),
    name: RoleName.create(row.name),
    isSystem: row.isSystem,
    permissions: row.permissions.map((p) => Permission.of(p.permission)),
  });
}
