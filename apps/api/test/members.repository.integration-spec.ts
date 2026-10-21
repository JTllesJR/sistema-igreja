import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemberNotFoundError } from '../src/modules/members/domain/errors.js';
import {
  NOW,
  aMember,
  congId,
  eventId,
  memberId,
  orgId,
} from '../src/modules/members/domain/testing/fixtures.js';
import { describeMemberRepositoryContract } from '../src/modules/members/domain/testing/member-repository.contract.js';
import { PrismaMemberRepository } from '../src/modules/members/infrastructure/prisma-member.repository.js';
import { ConfigModule } from '../src/platform/config/config.module.js';
import { DatabaseModule } from '../src/platform/database/database.module.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { cleanDatabase } from './support/clean-database.js';
import { seedCongregations, seedOrganizations } from './support/seed.js';

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

/** O banco exige as igrejas e as congregações das fixtures: igrejas 1 e 2; congregações 1 a 3 (igreja 1) e 10 (igreja 2). */
async function seeded(): Promise<PrismaMemberRepository> {
  await cleanDatabase(prisma);
  await seedOrganizations(prisma, [1, 2]);
  await seedCongregations(prisma, 1, [1, 2, 3]);
  await seedCongregations(prisma, 2, [10]);
  return new PrismaMemberRepository(prisma);
}

// A MESMA bateria que o repositório em memória cumpre: o fake dos testes dos casos de uso se comporta como o banco.
describeMemberRepositoryContract('Prisma/PostgreSQL', seeded);

describe('PrismaMemberRepository: o que só o banco real prova', () => {
  let repository: PrismaMemberRepository;

  beforeEach(async () => {
    repository = await seeded();
  });

  it('a gravação é atômica: se o evento falha, o membro também não entra (transação)', async () => {
    const member = aMember(1);
    await repository.add(member);

    // Mesmo id de evento já usado: o createMany do `add` viola a chave primária e DESFAZ o membro novo.
    const clash = aMember(2);
    Object.defineProperty(clash, 'pendingEvents', {
      get: () => member.pendingEvents,
    });

    await expect(repository.add(clash)).rejects.toThrow();
    expect(await repository.findById(orgId(1), memberId(2))).toBeNull();
  });

  it('a chave estrangeira COMPOSTA impede membro em congregação de OUTRA igreja', async () => {
    // Congregação 10 é da igreja 2; o membro é da igreja 1.
    const invalid = aMember(1, { organization: 1, congregation: 10 });

    await expect(repository.add(invalid)).rejects.toThrow();
    expect(await prisma.member.count()).toBe(0);
  });

  it('o banco recusa telefone fora do formato (CHECK), mesmo que outro caminho tente gravar', async () => {
    await repository.add(aMember(1));

    await expect(
      prisma.member.updateMany({ data: { phone: '123' } }),
    ).rejects.toThrow();
    await expect(
      prisma.member.updateMany({ data: { fullName: 'A' } }),
    ).rejects.toThrow();
  });

  it('o banco recusa observação de evento acima de 500 caracteres (CHECK)', async () => {
    await repository.add(aMember(1));

    await expect(
      prisma.memberHistoryEvent.updateMany({
        data: { notes: 'x'.repeat(501) },
      }),
    ).rejects.toThrow();
  });

  it('duas gravações simultâneas do mesmo membro: uma vence e a outra recebe conflito', async () => {
    await repository.add(aMember(1));
    const a = (await repository.findById(orgId(1), memberId(1)))!;
    const b = (await repository.findById(orgId(1), memberId(1)))!;
    a.changeStatus('AWAY', eventId(2), NOW);
    b.changeStatus('DECEASED', eventId(3), NOW);

    const results = await Promise.allSettled([
      repository.save(a),
      repository.save(b),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const events = await repository.listHistory(orgId(1), memberId(1));
    expect(events).toHaveLength(2);
  });

  it('salvar membro que não existe: MemberNotFoundError, não um erro do banco', async () => {
    await expect(repository.save(aMember(9))).rejects.toBeInstanceOf(
      MemberNotFoundError,
    );
  });

  it('a congregação não pode ser apagada enquanto houver membros nela (RESTRICT)', async () => {
    await repository.add(aMember(1, { congregation: 1 }));

    await expect(
      prisma.congregation.deleteMany({ where: { id: congId(1) } }),
    ).rejects.toThrow();
  });
});
