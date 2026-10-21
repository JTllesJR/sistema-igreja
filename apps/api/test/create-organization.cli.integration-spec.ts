import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  CreateOrganizationUseCase,
  createOrganizationCommand,
} from '../src/modules/organization/index.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { cleanDatabase } from './support/clean-database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  await moduleRef.init();
  prisma = moduleRef.get(PrismaService);
});

beforeEach(async () => {
  await cleanDatabase(prisma);
});

afterAll(async () => {
  await cleanDatabase(prisma);
  await moduleRef.close();
});

function run(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const useCase = moduleRef.get(CreateOrganizationUseCase, { strict: false });
  const exitCode = createOrganizationCommand(args, useCase, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { exitCode, out, err };
}

describe('comando create-organization (módulo real + PostgreSQL)', () => {
  it('grava a igreja e a sede no banco e imprime os ids gravados', async () => {
    const { exitCode, out } = run([
      '--name',
      'Igreja Central',
      '--headquarters',
      'Matriz',
    ]);

    expect(await exitCode).toBe(0);
    const organizationId = /organizationId: (\S+)/.exec(out.join('\n'))?.[1];
    const stored = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { congregations: true },
    });
    expect(stored?.name).toBe('Igreja Central');
    expect(stored?.version).toBe(0);
    expect(stored?.congregations).toHaveLength(1);
    expect(stored?.congregations[0]).toMatchObject({
      name: 'Matriz',
      isHeadquarters: true,
      status: 'ACTIVE',
    });
  });

  it('nome inválido: sai com erro e não grava nada', async () => {
    const { exitCode, err } = run(['--name', 'A']);

    expect(await exitCode).toBe(1);
    expect(err.join('\n')).toContain('nome da igreja');
    expect(await prisma.organization.count()).toBe(0);
  });
});
