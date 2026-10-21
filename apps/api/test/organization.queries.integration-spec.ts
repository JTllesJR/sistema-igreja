import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CreateOrganizationUseCase } from '../src/modules/organization/application/create-organization.use-case.js';
import {
  ORGANIZATION_QUERIES,
  type OrganizationQueries,
} from '../src/modules/organization/index.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { OrganizationId } from '../src/shared/domain/identifiers.js';
import { uuidFor } from '../src/shared/testing/uuid-for.js';
import { cleanDatabase } from './support/clean-database.js';

let moduleRef: TestingModule;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  await moduleRef.init();
});

beforeEach(async () => {
  await cleanDatabase(moduleRef.get(PrismaService));
});

afterAll(async () => {
  await cleanDatabase(moduleRef.get(PrismaService));
  await moduleRef.close();
});

describe('OrganizationQueries (API pública do módulo organization para os outros módulos)', () => {
  const queries = () =>
    moduleRef.get<OrganizationQueries>(ORGANIZATION_QUERIES, { strict: false });

  it('informa que uma igreja existente existe', async () => {
    const created = await moduleRef
      .get(CreateOrganizationUseCase, { strict: false })
      .execute({ name: 'Igreja Central', headquarters: { name: 'Sede' } });

    await expect(
      queries().organizationExists(created.organizationId),
    ).resolves.toBe(true);
  });

  it('informa que uma igreja inexistente não existe', async () => {
    await expect(
      queries().organizationExists(OrganizationId.of(uuidFor(404))),
    ).resolves.toBe(false);
  });
});
