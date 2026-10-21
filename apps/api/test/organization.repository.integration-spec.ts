import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../src/shared/domain/concurrency-conflict.error.js';
import type { Congregation } from '../src/modules/organization/domain/congregation.js';
import { OrganizationStateCorruptedError } from '../src/modules/organization/domain/errors.js';
import { Organization } from '../src/modules/organization/domain/organization.js';
import { OrganizationName } from '../src/modules/organization/domain/organization-name.js';
import {
  congId,
  name,
  orgId,
} from '../src/modules/organization/domain/testing/fixtures.js';
import { describeOrganizationRepositoryContract } from '../src/modules/organization/domain/testing/organization-repository.contract.js';
import { PrismaOrganizationRepository } from '../src/modules/organization/infrastructure/prisma-organization.repository.js';
import { ConfigModule } from '../src/platform/config/config.module.js';
import { DatabaseModule } from '../src/platform/database/database.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { cleanDatabase } from './support/clean-database.js';

let moduleRef: TestingModule;
let prisma: PrismaService;
let repository: PrismaOrganizationRepository;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, DatabaseModule],
  }).compile();
  prisma = moduleRef.get(PrismaService);
  repository = new PrismaOrganizationRepository(prisma);
});

afterAll(async () => {
  await cleanDatabase(prisma);
  await moduleRef.close();
});

function anOrganization(id = 1): Organization {
  return Organization.create({
    id: orgId(id),
    name: OrganizationName.create('Igreja Central'),
    headquarters: { id: congId(id * 10), name: name('Sede') },
  });
}

// A MESMA bateria que o repositório em memória cumpre: garante que o fake dos testes dos casos de uso
// se comporta como o banco de verdade.
describeOrganizationRepositoryContract('Prisma/PostgreSQL', async () => {
  await cleanDatabase(prisma);
  return new PrismaOrganizationRepository(prisma);
});

describe('PrismaOrganizationRepository: o que só um banco real prova', () => {
  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('o banco protege as regras mesmo quando o domínio é contornado (ADR 0009, seção 6)', () => {
    it('recusa uma segunda sede na mesma organização', async () => {
      await repository.add(anOrganization(1));

      await expect(
        prisma.congregation.create({
          data: {
            id: congId(2),
            organizationId: orgId(1),
            name: 'Intrusa',
            isHeadquarters: true,
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('recusa o mesmo nome com outra caixa na mesma organização', async () => {
      await repository.add(anOrganization(1));

      await expect(
        prisma.congregation.create({
          data: { id: congId(2), organizationId: orgId(1), name: 'SEDE' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('aceita o mesmo nome e uma sede em cada organização diferente', async () => {
      await repository.add(anOrganization(1));
      await repository.add(anOrganization(2));

      const second = await repository.findById(orgId(2));
      expect(second?.headquarters.name.value).toBe('Sede');
    });
  });

  it('grava a troca de sede mesmo quando a nova sede vem ANTES da antiga na lista', async () => {
    // O índice único "uma sede por organização" não é adiável: se o repositório atualizasse a nova sede antes de
    // desmarcar a antiga, o banco recusaria. O resultado não pode depender da ordem em que a lista chega.
    const original = anOrganization(1);
    original.registerCongregation({
      id: congId(2),
      name: name('Congregação Norte'),
    });
    await repository.add(original);
    const oldHeadquarters = original.findCongregation(
      congId(10),
    ) as Congregation; // a sede de anOrganization(1)
    const north = original.findCongregation(congId(2)) as Congregation;
    const swapped = Organization.restore({
      id: orgId(1),
      name: original.name,
      version: 0,
      congregations: [
        north.markAsHeadquarters(),
        oldHeadquarters.unmarkAsHeadquarters(),
      ],
    });

    await repository.save(swapped);

    const stored = (await repository.findById(orgId(1))) as Organization;
    expect(stored.headquarters.id).toBe(congId(2));
    expect(stored.congregations.filter((c) => c.isHeadquarters)).toHaveLength(
      1,
    );
  });

  it('dado gravado fora do domínio que viola uma invariante é acusado ao ler', async () => {
    await repository.add(anOrganization(1));
    // Alguém desativa a sede direto no banco, pulando o domínio.
    await prisma.congregation.update({
      where: { id: congId(10) },
      data: { status: 'INACTIVE' },
    });

    await expect(repository.findById(orgId(1))).rejects.toBeInstanceOf(
      OrganizationStateCorruptedError,
    );
  });

  it('dois save realmente simultâneos: um vence e o outro recebe conflito', async () => {
    await repository.add(anOrganization(1));
    const a = (await repository.findById(orgId(1))) as Organization;
    const b = (await repository.findById(orgId(1))) as Organization;
    a.rename(OrganizationName.create('Via A'));
    b.rename(OrganizationName.create('Via B'));

    const results = await Promise.allSettled([
      repository.save(a),
      repository.save(b),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConcurrencyConflictError);
    expect((await repository.findById(orgId(1)))?.version).toBe(1);
  });

  it('save é atômico: se uma gravação falha no meio, nada é aplicado', async () => {
    const original = anOrganization(1);
    original.registerCongregation({
      id: congId(3),
      name: name('Congregação Sul'),
    });
    await repository.add(original);
    const loaded = (await repository.findById(orgId(1))) as Organization;
    // Entre a leitura e a gravação, alguém cria "Norte" direto no banco (fora do domínio e da versão).
    await prisma.congregation.create({
      data: {
        id: congId(99),
        organizationId: orgId(1),
        name: 'Congregação Norte',
      },
    });
    // Alterações que o save aplica ANTES de chegar à que falha, e que são visíveis se ficarem para trás:
    loaded.rename(OrganizationName.create('Nome que não pode vingar')); // UPDATE da organização
    loaded.deactivateCongregation(congId(3)); // UPDATE de uma congregação existente
    loaded.registerCongregation({
      id: congId(2),
      name: name('congregação norte'),
    }); // INSERT que viola o índice

    await expect(repository.save(loaded)).rejects.toThrow();

    const stored = (await repository.findById(orgId(1))) as Organization;
    expect(stored.name.value).toBe('Igreja Central');
    expect(stored.version).toBe(0);
    expect(stored.findCongregation(congId(3))?.status).toBe('ACTIVE');
    expect(stored.congregations).toHaveLength(3); // sede, Sul e a "Norte" criada por fora
  });
});
