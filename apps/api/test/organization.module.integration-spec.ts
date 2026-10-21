import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CreateOrganizationUseCase } from '../src/modules/organization/application/create-organization.use-case.js';
import { DesignateHeadquartersUseCase } from '../src/modules/organization/application/designate-headquarters.use-case.js';
import { ListCongregationsUseCase } from '../src/modules/organization/application/list-congregations.use-case.js';
import { RegisterCongregationUseCase } from '../src/modules/organization/application/register-congregation.use-case.js';
import { CongregationNameAlreadyInUseError } from '../src/modules/organization/domain/errors.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { ActorId } from '../src/shared/domain/identifiers.js';
import { cleanDatabase } from './support/clean-database.js';

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

const use = <T>(token: new (...args: never[]) => T): T =>
  moduleRef.get(token, { strict: false });

describe('OrganizationModule (injeção de dependência + PostgreSQL, sem HTTP)', () => {
  it('monta os casos de uso e percorre um fluxo completo gravando no banco', async () => {
    const created = await use(CreateOrganizationUseCase).execute({
      name: 'Igreja Central',
      headquarters: { name: 'Sede' },
    });
    const context = {
      organizationId: created.organizationId,
      actorId: ActorId.of(created.organizationId),
    };

    const north = await use(RegisterCongregationUseCase).execute(context, {
      name: 'Congregação Norte',
      address: { street: 'Rua das Flores', city: 'Campinas', state: 'SP' },
      serviceTimes: [
        { weekday: 'SUNDAY', time: '19:00', name: 'Culto de celebração' },
      ],
    });
    await use(DesignateHeadquartersUseCase).execute(context, {
      congregationId: north.id,
    });

    const list = await use(ListCongregationsUseCase).execute(context, {});
    expect(list.map((c) => [c.name, c.isHeadquarters])).toEqual([
      ['Congregação Norte', true],
      ['Sede', false],
    ]);
    expect(list[0]?.address?.city).toBe('Campinas');
  });

  it('gera os identificadores como UUID v7', async () => {
    const created = await use(CreateOrganizationUseCase).execute({
      name: 'Igreja Central',
      headquarters: { name: 'Sede' },
    });

    expect(created.organizationId).toMatch(UUID_V7);
    expect(created.headquartersId).toMatch(UUID_V7);
  });

  it('propaga erros de domínio vindos do banco real (nome repetido)', async () => {
    const created = await use(CreateOrganizationUseCase).execute({
      name: 'Igreja Central',
      headquarters: { name: 'Sede' },
    });
    const context = {
      organizationId: created.organizationId,
      actorId: ActorId.of(created.organizationId),
    };

    await expect(
      use(RegisterCongregationUseCase).execute(context, { name: 'sede' }),
    ).rejects.toBeInstanceOf(CongregationNameAlreadyInUseError);
  });
});
