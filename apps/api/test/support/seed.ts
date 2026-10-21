import type { PrismaService } from '../../src/platform/database/prisma.service.js';
import {
  A_PASSWORD_HASH,
  congId,
  orgId,
  roleId,
  userId,
} from '../../src/modules/identity-access/domain/testing/fixtures.js';

/**
 * Linhas de apoio exigidas pelas chaves estrangeiras quando os contratos de repositório rodam no PostgreSQL.
 * Usam os mesmos ids das fixtures do domínio (`orgId(n)`, `congId(n)`, `roleId(n)`, `userId(n)`).
 */
export async function seedOrganizations(
  prisma: PrismaService,
  numbers: number[],
): Promise<void> {
  for (const n of numbers) {
    await prisma.organization.create({
      data: { id: orgId(n), name: `Igreja ${n}` },
    });
  }
}

export async function seedCongregations(
  prisma: PrismaService,
  organization: number,
  numbers: number[],
): Promise<void> {
  for (const n of numbers) {
    await prisma.congregation.create({
      data: {
        id: congId(n),
        organizationId: orgId(organization),
        name: `Congregação ${n}`,
        isHeadquarters: n === numbers[0],
      },
    });
  }
}

export async function seedRoles(
  prisma: PrismaService,
  organization: number,
  numbers: number[],
): Promise<void> {
  for (const n of numbers) {
    await prisma.role.create({
      data: {
        id: roleId(n),
        organizationId: orgId(organization),
        name: `Papel ${n}`,
      },
    });
  }
}

export async function seedUsers(
  prisma: PrismaService,
  organization: number,
  numbers: number[],
): Promise<void> {
  for (const n of numbers) {
    await prisma.userAccount.create({
      data: {
        id: userId(n),
        organizationId: orgId(organization),
        email: `usuario${n}@igreja.com`,
        passwordHash: A_PASSWORD_HASH,
      },
    });
  }
}
