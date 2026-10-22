import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InsufficientBalanceError } from '../src/modules/finance/domain/errors.js';
import { describeFinanceRepositoriesContract } from '../src/modules/finance/domain/testing/finance-repositories.contract.js';
import {
  NOW,
  aCategory,
  aConfiguration,
  accountId,
  actor,
  anAccount,
  anExpense,
  anIncome,
  approved,
  categoryId,
  congId,
  entryId,
  member,
  orgId,
} from '../src/modules/finance/domain/testing/fixtures.js';
import {
  PrismaAccountRepository,
  PrismaCategoryRepository,
  PrismaEntryRepository,
} from '../src/modules/finance/infrastructure/prisma-finance.repositories.js';
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

/**
 * O banco exige as igrejas e congregações das fixtures (igrejas 1 e 2; congregações 1 a 3 da igreja 1 e a 10 da 2) e os
 * membros 1 a 3 da igreja 1 (que o contrato liga às entradas).
 */
async function seeded() {
  await cleanDatabase(prisma);
  await seedOrganizations(prisma, [1, 2]);
  await seedCongregations(prisma, 1, [1, 2, 3]);
  await seedCongregations(prisma, 2, [10]);
  for (const n of [1, 2, 3]) {
    await prisma.member.create({
      data: {
        id: member(n),
        organizationId: orgId(1),
        congregationId: congId(1),
        fullName: `Membro ${n}`,
        nameKey: `membro ${n}`,
      },
    });
  }
  return {
    accounts: new PrismaAccountRepository(prisma),
    categories: new PrismaCategoryRepository(prisma),
    entries: new PrismaEntryRepository(prisma),
  };
}

// A MESMA bateria que os repositórios em memória cumprem: o fake dos testes dos casos de uso se comporta como o banco.
describeFinanceRepositoriesContract('Prisma/PostgreSQL', seeded);

describe('Repositórios do finance: o que só o banco real prova', () => {
  let repos: Awaited<ReturnType<typeof seeded>>;

  beforeEach(async () => {
    repos = await seeded();
    // As contas e categorias do cenário (o contrato as grava sozinho; aqui precisamos delas nos testes abaixo).
    for (const spec of aConfiguration.accounts) {
      await repos.accounts.add(anAccount(spec.n));
    }
    for (const spec of aConfiguration.categories) {
      await repos.categories.add(aCategory(spec.n));
    }
  });

  it('o gatilho recusa APAGAR qualquer lançamento, mesmo por SQL direto', async () => {
    await repos.entries.add([anIncome({ id: 1 })]);

    await expect(prisma.financialEntry.deleteMany()).rejects.toThrow();
    expect(await prisma.financialEntry.count()).toBe(1);
  });

  it('o gatilho recusa ALTERAR um lançamento já decidido (valor, conta, tudo)', async () => {
    await repos.entries.add([anIncome({ id: 1, cents: 5_000 })]);

    await expect(
      prisma.financialEntry.updateMany({ data: { amountCents: 9_999n } }),
    ).rejects.toThrow();
    await expect(
      prisma.financialEntry.updateMany({ data: { description: 'trocada' } }),
    ).rejects.toThrow();
    expect(
      (await repos.entries.findById(orgId(1), entryId(1)))?.amount.cents,
    ).toBe(5_000);
  });

  it('num pedido PENDENTE só mudam os campos da decisão, nunca o valor', async () => {
    await repos.entries.add([anExpense({ id: 2, cents: 100 })]);

    await expect(
      prisma.financialEntry.updateMany({
        where: { id: entryId(2) },
        data: { amountCents: 1n },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.financialEntry.updateMany({
        where: { id: entryId(2) },
        data: { direction: 'IN' },
      }),
    ).rejects.toThrow();
  });

  it('o CHECK recusa quem pediu decidindo o próprio pedido, mesmo que o aplicativo errasse', async () => {
    await repos.entries.add([anExpense({ id: 2, by: 1 })]);

    await expect(
      prisma.financialEntry.updateMany({
        where: { id: entryId(2) },
        data: {
          status: 'CONFIRMED',
          decidedBy: actor(1),
          decidedAt: NOW,
        },
      }),
    ).rejects.toThrow();
    expect((await repos.entries.findById(orgId(1), entryId(2)))?.status).toBe(
      'PENDING',
    );
  });

  it('o CHECK recusa confirmar uma SAÍDA sem decisor', async () => {
    await repos.entries.add([anExpense({ id: 2 })]);

    await expect(
      prisma.financialEntry.updateMany({
        where: { id: entryId(2) },
        data: { status: 'CONFIRMED', decidedAt: NOW },
      }),
    ).rejects.toThrow();
  });

  it('o CHECK recusa valor zero, negativo ou acima do teto', async () => {
    for (const cents of [0n, -1n, 10_000_000_001n]) {
      await expect(
        prisma.financialEntry.create({
          data: {
            id: entryId(50),
            organizationId: orgId(1),
            congregationId: congId(1),
            accountId: accountId(1),
            kind: 'ORDINARY',
            direction: 'IN',
            amountCents: cents,
            occurredOn: new Date('2026-10-01T00:00:00.000Z'),
            categoryId: categoryId(1),
            status: 'CONFIRMED',
            requestedBy: actor(1),
            requestedAt: NOW,
          },
        }),
      ).rejects.toThrow();
    }
  });

  it('a chave estrangeira COMPOSTA impede lançamento com congregação diferente da da conta', async () => {
    // A conta 1 é da congregação 1; o lançamento diz congregação 2.
    await expect(
      prisma.financialEntry.create({
        data: {
          id: entryId(50),
          organizationId: orgId(1),
          congregationId: congId(2),
          accountId: accountId(1),
          kind: 'ORDINARY',
          direction: 'IN',
          amountCents: 100n,
          occurredOn: new Date('2026-10-01T00:00:00.000Z'),
          categoryId: categoryId(1),
          status: 'CONFIRMED',
          requestedBy: actor(1),
          requestedAt: NOW,
        },
      }),
    ).rejects.toThrow();
  });

  it('a chave estrangeira COMPOSTA impede categoria ou membro de outra igreja', async () => {
    // Categoria 10 é da igreja 2.
    await expect(
      repos.entries.add([anIncome({ id: 1, category: 10 })]),
    ).rejects.toThrow();
    expect(await prisma.financialEntry.count()).toBe(0);
  });

  it('o banco recusa nome de conta vazio (CHECK)', async () => {
    await expect(
      prisma.financialAccount.updateMany({
        where: { id: accountId(1) },
        data: { name: '   ' },
      }),
    ).rejects.toThrow();
  });

  it('CORRIDA: duas aprovações simultâneas que juntas passam do saldo — só uma vence', async () => {
    await repos.entries.add([
      anIncome({ id: 1, cents: 10_000 }),
      anExpense({ id: 2, cents: 7_000 }),
      anExpense({ id: 3, cents: 7_000 }),
    ]);

    const results = await Promise.allSettled([
      repos.entries.decide([approved(anExpense({ id: 2, cents: 7_000 }))]),
      repos.entries.decide([approved(anExpense({ id: 3, cents: 7_000 }))]),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(
      InsufficientBalanceError,
    );
    // O saldo final nunca ficou negativo: 10.000 - 7.000.
    const rows = await repos.entries.aggregate(orgId(1), {
      congregationIds: null,
      from: null,
      to: null,
    });
    const balance = rows.reduce(
      (sum, r) => sum + (r.direction === 'IN' ? r.totalCents : -r.totalCents),
      0,
    );
    expect(balance).toBe(3_000);
  });

  it('a decisão é atômica: se a segunda perna falha, a primeira volta atrás (transação)', async () => {
    const a = anExpense({ id: 2, cents: 100 });
    await repos.entries.add([anIncome({ id: 1, cents: 1_000 }), a]);

    // A segunda entrada não existe: a decisão inteira desfaz.
    await expect(
      repos.entries.decide([approved(a), approved(anExpense({ id: 99 }))]),
    ).rejects.toThrow();
    expect((await repos.entries.findById(orgId(1), entryId(2)))?.status).toBe(
      'PENDING',
    );
  });

  it('os centavos grandes não perdem precisão (BIGINT)', async () => {
    await repos.entries.add([anIncome({ id: 1, cents: 10_000_000_000 })]);

    expect(
      (await repos.entries.findById(orgId(1), entryId(1)))?.amount.cents,
    ).toBe(10_000_000_000);
  });
});
