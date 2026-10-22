import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ensureDefaultRoles } from '../src/modules/identity-access/application/default-roles.js';
import { ListRolesUseCase } from '../src/modules/identity-access/application/list-roles.use-case.js';
import { orgId } from '../src/modules/identity-access/domain/testing/fixtures.js';
import { PrismaRoleRepository } from '../src/modules/identity-access/infrastructure/prisma-role.repository.js';
import { ConfigModule } from '../src/platform/config/config.module.js';
import { DatabaseModule } from '../src/platform/database/database.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { ActorId } from '../src/shared/domain/identifiers.js';
import { UuidV7IdGenerator } from '../src/shared/infrastructure/uuid-v7-id-generator.js';
import { uuidFor } from '../src/shared/testing/uuid-for.js';
import { cleanDatabase } from './support/clean-database.js';
import { seedOrganizations } from './support/seed.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let roles: PrismaRoleRepository;
const ids = new UuidV7IdGenerator();

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DatabaseModule],
  }).compile();
  prisma = moduleRef.get(PrismaService);
  roles = new PrismaRoleRepository(prisma);
});

beforeEach(async () => {
  await cleanDatabase(prisma);
  await seedOrganizations(prisma, [1, 2]);
});

afterAll(async () => {
  await cleanDatabase(prisma);
  await moduleRef.close();
});

describe('papéis padrão (PostgreSQL real)', () => {
  it('várias chamadas SIMULTÂNEAS terminam com exatamente 5 papéis, e todas recebem os mesmos', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => ensureDefaultRoles(roles, ids, orgId(1))),
    );

    expect(
      await prisma.role.count({ where: { organizationId: orgId(1) } }),
    ).toBe(5);
    const administrators = new Set(results.map((r) => r.administrator.id));
    const secretaries = new Set(results.map((r) => r.secretary.id));
    expect(administrators.size).toBe(1);
    expect(secretaries.size).toBe(1);
  });

  it('grava as permissões de cada papel e isola as igrejas', async () => {
    await ensureDefaultRoles(roles, ids, orgId(1));

    const secretary = await prisma.role.findFirstOrThrow({
      where: { organizationId: orgId(1), name: 'Secretário' },
      include: { permissions: true },
    });

    expect(secretary.isSystem).toBe(true);
    expect(secretary.permissions.map((p) => p.permission).sort()).toEqual([
      'members:read',
      'members:write',
      'organization:read',
    ]);
    expect(
      await prisma.role.count({ where: { organizationId: orgId(2) } }),
    ).toBe(0);
  });

  it('ListRoles numa igreja sem papéis cria os padrão e devolve a lista ordenada', async () => {
    const list = new ListRolesUseCase(roles, ids);

    const result = await list.execute({
      organizationId: orgId(1),
      actorId: ActorId.of(uuidFor(9)),
    });

    expect(result.map((r) => r.name)).toEqual([
      'Administrador',
      'Diretoria',
      'Dirigente',
      'Secretário',
      'Tesoureiro',
    ]);
  });
});
