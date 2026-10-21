import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AUDIT_LOG, AuditModule } from '../src/modules/audit/index.js';
import { ConfigModule } from '../src/platform/config/config.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import type { AuditLog } from '../src/shared/application/audit-log.js';
import { ActorId, OrganizationId } from '../src/shared/domain/identifiers.js';
import { uuidFor } from '../src/shared/testing/uuid-for.js';
import { cleanDatabase } from './support/clean-database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let audit: AuditLog;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, AuditModule],
  }).compile();
  prisma = moduleRef.get(PrismaService, { strict: false });
  audit = moduleRef.get<AuditLog>(AUDIT_LOG);
});

beforeEach(async () => {
  await cleanDatabase(prisma);
});

afterAll(async () => {
  await cleanDatabase(prisma);
  await moduleRef.close();
});

const entry = {
  organizationId: OrganizationId.of(uuidFor(1)),
  actorId: ActorId.of(uuidFor(2)),
  action: 'member.viewed',
  entity: 'member',
  entityId: uuidFor(3),
  metadata: { count: 1 },
};

describe('trilha de auditoria (PostgreSQL)', () => {
  it('registra quem, o quê e em qual dado, com o instante do BANCO', async () => {
    await audit.record(entry);

    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: entry.organizationId,
      actorId: entry.actorId,
      action: 'member.viewed',
      entity: 'member',
      entityId: entry.entityId,
      metadata: { count: 1 },
    });
    expect(Math.abs(Date.now() - rows[0]!.occurredAt.getTime())).toBeLessThan(
      60_000,
    );
  });

  it('aceita entrada sem dado afetado nem metadados', async () => {
    await audit.record({ ...entry, entityId: null, metadata: undefined });

    expect(await prisma.auditLog.count()).toBe(1);
  });

  it('o banco RECUSA alterar o que foi registrado', async () => {
    await audit.record(entry);

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "audit_log" SET "action" = 'x'`),
    ).rejects.toThrow(/somente-anexação/);
    await expect(
      prisma.auditLog.updateMany({ data: { action: 'x' } }),
    ).rejects.toThrow(/somente-anexação/);
  });

  it('o banco RECUSA apagar o que foi registrado', async () => {
    await audit.record(entry);

    await expect(prisma.auditLog.deleteMany()).rejects.toThrow(
      /somente-anexação/,
    );
    expect(await prisma.auditLog.count()).toBe(1);
  });
});
