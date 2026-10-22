import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { OrganizationQueriesDirectory } from '../src/modules/identity-access/infrastructure/organization-queries-directory.js';
import { CreateOrganizationUseCase } from '../src/modules/organization/application/create-organization.use-case.js';
import {
  ORGANIZATION_QUERIES,
  type OrganizationQueries,
} from '../src/modules/organization/index.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { CongregationId } from '../src/shared/domain/identifiers.js';
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

/** O adaptador do identity-access sobre a API pública REAL do organization e o PostgreSQL. */
describe('OrganizationQueriesDirectory.isCongregationActive (banco real)', () => {
  const directory = () =>
    new OrganizationQueriesDirectory(
      moduleRef.get<OrganizationQueries>(ORGANIZATION_QUERIES, {
        strict: false,
      }),
    );
  const church = (name: string) =>
    moduleRef
      .get(CreateOrganizationUseCase, { strict: false })
      .execute({ name, headquarters: { name: `Sede de ${name}` } });

  it('congregação ativa da própria igreja: true', async () => {
    const mine = await church('Igreja A');

    await expect(
      directory().isCongregationActive(
        mine.organizationId,
        mine.headquartersId,
      ),
    ).resolves.toBe(true);
  });

  it('congregação inativa: false', async () => {
    const mine = await church('Igreja A');
    await moduleRef.get(PrismaService).congregation.update({
      where: { id: mine.headquartersId },
      data: { status: 'INACTIVE' },
    });

    await expect(
      directory().isCongregationActive(
        mine.organizationId,
        mine.headquartersId,
      ),
    ).resolves.toBe(false);
  });

  it('congregação de OUTRA igreja ou inexistente: false', async () => {
    const mine = await church('Igreja A');
    const other = await church('Igreja B');

    await expect(
      directory().isCongregationActive(
        mine.organizationId,
        other.headquartersId,
      ),
    ).resolves.toBe(false);
    await expect(
      directory().isCongregationActive(
        mine.organizationId,
        CongregationId.of(uuidFor(9999)),
      ),
    ).resolves.toBe(false);
  });
});
