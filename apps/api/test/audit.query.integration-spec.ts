import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  describeAuditQueryContract,
  aRecord,
  everything,
  orgId,
  recordId,
} from '../src/modules/audit/domain/testing/audit-query.contract.js';
import type { AuditRecord } from '../src/modules/audit/domain/audit-record.js';
import { PrismaAuditQueryRepository } from '../src/modules/audit/infrastructure/prisma-audit-query.repository.js';
import { ConfigModule } from '../src/platform/config/config.module.js';
import { DatabaseModule } from '../src/platform/database/database.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { cleanDatabase } from './support/clean-database.js';
import { seedOrganizations } from './support/seed.js';

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

/** A trilha só aceita INSERT: o teste grava direto, escolhendo o instante (a trilha de verdade deixa o BANCO escolher). */
async function harness() {
  await cleanDatabase(prisma);
  await seedOrganizations(prisma, [1, 2]);
  const repository = new PrismaAuditQueryRepository(prisma);
  return {
    repository,
    seed: async (records: AuditRecord[]) => {
      await prisma.auditLog.createMany({
        data: records.map((r) => ({
          id: r.id,
          organizationId: r.organizationId,
          actorId: r.actorId,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          ...(r.metadata ? { metadata: r.metadata } : {}),
          occurredAt: r.occurredAt,
        })),
      });
    },
  };
}

// A MESMA bateria que o repositório em memória cumpre.
describeAuditQueryContract('Prisma/PostgreSQL', harness);

describe('PrismaAuditQueryRepository: o que só o banco real prova', () => {
  it('a trilha continua somente-anexação: o banco recusa alterar ou apagar o que a consulta lê', async () => {
    const { repository, seed } = await harness();
    await seed([aRecord(1)]);

    expect(await repository.search(orgId(1), everything)).toHaveLength(1);
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow();
    await expect(
      prisma.auditLog.updateMany({ data: { action: 'x.y' } }),
    ).rejects.toThrow();
    expect((await repository.search(orgId(1), everything))[0]?.id).toBe(
      recordId(1),
    );
  });

  it('o instante guarda milissegundos e o cursor não perde nem repete registros de mesmo instante', async () => {
    const { repository, seed } = await harness();
    const same = '2026-10-20T12:00:00.123Z';
    await seed([
      aRecord(1, { at: same }),
      aRecord(2, { at: same }),
      aRecord(3, { at: same }),
    ]);

    const first = await repository.search(orgId(1), {
      ...everything,
      limit: 2,
    });
    const rest = await repository.search(orgId(1), {
      ...everything,
      before: { occurredAt: first[1]!.occurredAt, id: first[1]!.id },
    });

    expect([...first, ...rest].map((r) => r.id)).toEqual([
      recordId(3),
      recordId(2),
      recordId(1),
    ]);
    expect(first[0]?.occurredAt.toISOString()).toBe(same);
  });
});
