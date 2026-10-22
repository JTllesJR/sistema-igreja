import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RoleInUseError } from '../src/modules/identity-access/domain/errors.js';
import { PasswordHash } from '../src/modules/identity-access/domain/password-hash.js';
import { Session } from '../src/modules/identity-access/domain/session.js';
import {
  A_PASSWORD_HASH,
  DAY,
  NOW,
  aUser,
  congId,
  familyId,
  orgId,
  roleId,
  sessionId,
  userId,
} from '../src/modules/identity-access/domain/testing/fixtures.js';
import { describeRoleRepositoryContract } from '../src/modules/identity-access/domain/testing/role-repository.contract.js';
import { describeSessionRepositoryContract } from '../src/modules/identity-access/domain/testing/session-repository.contract.js';
import { describeUserRepositoryContract } from '../src/modules/identity-access/domain/testing/user-repository.contract.js';
import { User } from '../src/modules/identity-access/domain/user.js';
import { PrismaRoleRepository } from '../src/modules/identity-access/infrastructure/prisma-role.repository.js';
import { PrismaSessionRepository } from '../src/modules/identity-access/infrastructure/prisma-session.repository.js';
import { PrismaUserRepository } from '../src/modules/identity-access/infrastructure/prisma-user.repository.js';
import { ConfigModule } from '../src/platform/config/config.module.js';
import { DatabaseModule } from '../src/platform/database/database.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { ConcurrencyConflictError } from '../src/shared/domain/concurrency-conflict.error.js';
import { cleanDatabase } from './support/clean-database.js';
import {
  seedCongregations,
  seedOrganizations,
  seedRoles,
  seedUsers,
} from './support/seed.js';

let moduleRef: TestingModule;
let prisma: PrismaService;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DatabaseModule],
  }).compile();
  prisma = moduleRef.get(PrismaService);
});

afterAll(async () => {
  await cleanDatabase(prisma);
  await moduleRef.close();
});

// A MESMA bateria que os repositórios em memória cumprem: o fake dos testes dos casos de uso se comporta como o banco.
describeUserRepositoryContract('Prisma/PostgreSQL', async () => {
  await cleanDatabase(prisma);
  await seedOrganizations(prisma, [1, 2]);
  await seedCongregations(prisma, 1, [1, 2]);
  await seedRoles(prisma, 1, [1, 2]);
  return new PrismaUserRepository(prisma);
});

describeRoleRepositoryContract('Prisma/PostgreSQL', async () => {
  await cleanDatabase(prisma);
  await seedOrganizations(prisma, [1, 2]);
  return new PrismaRoleRepository(prisma);
});

describeSessionRepositoryContract('Prisma/PostgreSQL', async () => {
  await cleanDatabase(prisma);
  await seedOrganizations(prisma, [1]);
  await seedUsers(prisma, 1, [1, 2]);
  return new PrismaSessionRepository(prisma);
});

describe('identity-access: o que só um banco real prova', () => {
  beforeEach(async () => {
    await cleanDatabase(prisma);
    await seedOrganizations(prisma, [1, 2]);
    await seedCongregations(prisma, 1, [1]);
    await seedCongregations(prisma, 2, [2]);
    await seedRoles(prisma, 1, [1, 2]);
    await seedRoles(prisma, 2, [3]);
    await seedUsers(prisma, 1, [1]);
  });

  describe('o banco protege as regras mesmo quando o domínio é contornado', () => {
    it('recusa e-mail que não esteja normalizado (minúsculas, sem espaços)', async () => {
      await expect(
        prisma.userAccount.create({
          data: {
            id: userId(9),
            organizationId: orgId(1),
            email: 'Maria@Igreja.com',
            passwordHash: A_PASSWORD_HASH,
          },
        }),
      ).rejects.toThrow(/user_account_email_normalized|check/i);
    });

    it('recusa o mesmo e-mail em igrejas diferentes (único em todo o sistema)', async () => {
      await expect(
        prisma.userAccount.create({
          data: {
            id: userId(9),
            organizationId: orgId(2),
            email: 'usuario1@igreja.com',
            passwordHash: A_PASSWORD_HASH,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('recusa dar a um usuário um papel de OUTRA igreja (FK composta)', async () => {
      await expect(
        prisma.userRoleAssignment.create({
          data: {
            organizationId: orgId(1),
            userId: userId(1),
            roleId: roleId(3),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('remove de um papel ATRIBUÍDO é recusado com RoleInUseError e nada é apagado (ADR 0019)', async () => {
      await prisma.userRoleAssignment.create({
        data: {
          organizationId: orgId(1),
          userId: userId(1),
          roleId: roleId(2),
        },
      });
      await prisma.rolePermission.create({
        data: { roleId: roleId(2), permission: 'members:read' },
      });
      const roles = new PrismaRoleRepository(prisma);

      await expect(roles.remove(orgId(1), roleId(2))).rejects.toBeInstanceOf(
        RoleInUseError,
      );
      const [kept] = await roles.findByIds([roleId(2)]);
      expect(kept?.permissions.map((p) => p.value)).toEqual(['members:read']);
    });

    it('recusa escopo em congregação de OUTRA igreja (FK composta)', async () => {
      await expect(
        prisma.userRoleAssignment.create({
          data: {
            organizationId: orgId(1),
            userId: userId(1),
            roleId: roleId(1),
            congregationId: congId(2),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('aceita atribuição para a igreja toda (congregação nula) mesmo com a FK composta', async () => {
      await expect(
        prisma.userRoleAssignment.create({
          data: {
            organizationId: orgId(1),
            userId: userId(1),
            roleId: roleId(1),
          },
        }),
      ).resolves.toBeDefined();
    });

    it('recusa a mesma atribuição repetida, tanto para a igreja toda quanto por congregação', async () => {
      const orgWide = {
        organizationId: orgId(1),
        userId: userId(1),
        roleId: roleId(1),
      };
      await prisma.userRoleAssignment.create({ data: orgWide });
      await expect(
        prisma.userRoleAssignment.create({ data: orgWide }),
      ).rejects.toMatchObject({
        code: 'P2002',
      });

      const scoped = { ...orgWide, congregationId: congId(1) };
      await prisma.userRoleAssignment.create({ data: scoped });
      await expect(
        prisma.userRoleAssignment.create({ data: scoped }),
      ).rejects.toMatchObject({
        code: 'P2002',
      });
    });

    it('recusa nome de papel repetido na igreja, sem diferenciar caixa; em outra igreja aceita', async () => {
      await expect(
        prisma.role.create({
          data: { id: roleId(8), organizationId: orgId(1), name: 'PAPEL 1' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      await expect(
        prisma.role.create({
          data: { id: roleId(9), organizationId: orgId(2), name: 'PAPEL 1' },
        }),
      ).resolves.toBeDefined();
    });

    it('recusa sessão de um usuário que pertence a OUTRA igreja (FK composta)', async () => {
      await expect(
        prisma.session.create({
          data: {
            id: sessionId(1),
            organizationId: orgId(2),
            userId: userId(1),
            familyId: familyId(1),
            tokenHash: 'a'.repeat(64),
            familyStartedAt: NOW,
            expiresAt: new Date(NOW.getTime() + 30 * DAY),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2003' });
    });

    it('recusa dois tokens com o mesmo hash', async () => {
      const row = {
        organizationId: orgId(1),
        userId: userId(1),
        familyId: familyId(1),
        tokenHash: 'b'.repeat(64),
        familyStartedAt: NOW,
        expiresAt: new Date(NOW.getTime() + 30 * DAY),
      };
      await prisma.session.create({ data: { id: sessionId(1), ...row } });

      await expect(
        prisma.session.create({ data: { id: sessionId(2), ...row } }),
      ).rejects.toMatchObject({
        code: 'P2002',
      });
    });
  });

  describe('PrismaUserRepository', () => {
    it('save é atômico: se uma gravação falha no meio, nada é aplicado', async () => {
      const users = new PrismaUserRepository(prisma);
      await prisma.userAccount.deleteMany();
      await users.add(aUser(1));
      const loaded = (await users.findById(userId(1))) as User;
      loaded.recordFailedLogin(NOW); // UPDATE da conta
      loaded.assignRole(roleId(1)); // válido
      loaded.assignRole(roleId(99)); // papel que não existe: o INSERT falha por FK, depois do UPDATE

      await expect(users.save(loaded)).rejects.toThrow();

      const stored = (await users.findById(userId(1))) as User;
      expect(stored.failedLoginAttempts).toBe(0);
      expect(stored.version).toBe(0);
      expect(stored.assignments).toHaveLength(0);
    });

    it('dois save realmente simultâneos: um vence e o outro recebe conflito', async () => {
      const users = new PrismaUserRepository(prisma);
      await prisma.userAccount.deleteMany();
      await users.add(aUser(1));
      const a = (await users.findById(userId(1))) as User;
      const b = (await users.findById(userId(1))) as User;
      a.recordFailedLogin(NOW);
      b.recordFailedLogin(NOW);

      const results = await Promise.allSettled([users.save(a), users.save(b)]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(ConcurrencyConflictError);
      expect((await users.findById(userId(1)))?.version).toBe(1);
    });

    it('guarda só o hash da senha (formato argon2id), nunca a senha', async () => {
      const users = new PrismaUserRepository(prisma);
      await prisma.userAccount.deleteMany();
      await users.add(
        User.register({
          id: userId(5),
          organizationId: orgId(1),
          email: aUser(5).email,
          passwordHash: PasswordHash.of(A_PASSWORD_HASH),
        }),
      );

      const row = await prisma.userAccount.findUnique({
        where: { id: userId(5) },
      });

      expect(row?.passwordHash.startsWith('$argon2id$')).toBe(true);
    });
  });

  describe('PrismaSessionRepository', () => {
    it('rotate é atômico: se criar a próxima falha, a anterior não fica marcada como trocada', async () => {
      const sessions = new PrismaSessionRepository(prisma);
      const policy = { idleMs: 30 * DAY, absoluteMs: 90 * DAY };
      const first = Session.start({
        id: sessionId(1),
        organizationId: orgId(1),
        userId: userId(1),
        familyId: familyId(1),
        tokenHash: '1'.repeat(64),
        now: NOW,
        policy,
      });
      await sessions.add(first);
      // A "próxima" reaproveita um hash já existente: o INSERT falha depois do UPDATE da anterior.
      const { previous, next } = first.rotate({
        nextId: sessionId(2),
        nextTokenHash: '1'.repeat(64),
        now: NOW,
        policy,
      });

      await expect(sessions.rotate(previous, next)).rejects.toThrow();

      const stored = (await sessions.findById(sessionId(1))) as Session;
      expect(stored.state(NOW)).toBe('ACTIVE');
    });
  });
});
