import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigModule } from '../src/platform/config/config.module.js';
import { DatabaseModule } from '../src/platform/database/database.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('persistência (integração, PostgreSQL real)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, DatabaseModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('grava e lê uma Organization (migration aplicada, id UUID v7, timestamps)', async () => {
    const created = await prisma.organization.create({
      data: { name: 'Igreja de Teste' },
    });

    try {
      expect(created.id).toMatch(UUID_V7);

      const found = await prisma.organization.findUniqueOrThrow({
        where: { id: created.id },
      });

      expect(found.name).toBe('Igreja de Teste');
      expect(found.createdAt).toBeInstanceOf(Date);
      expect(found.updatedAt).toBeInstanceOf(Date);
    } finally {
      await prisma.organization.delete({ where: { id: created.id } });
    }
  });
});
