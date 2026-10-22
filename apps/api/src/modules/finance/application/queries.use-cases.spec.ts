import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import {
  AccountNameTakenError,
  AccountNotFoundError,
  ApprovalNotAllowedError,
  CategoryNameTakenError,
  FinanceAccessDeniedError,
  ContributorNotFoundError,
} from '../domain/errors.js';
import { DEFAULT_CATEGORIES } from '../domain/finance-category.js';
import {
  accountId,
  categoryId,
  congId,
  member,
  orgId,
} from '../domain/testing/fixtures.js';
import {
  FakeFinanceAccess,
  aTestBed,
  board,
  everything,
  treasurerOf,
  type TestBed,
} from './testing/test-bed.js';

describe('contas (UC-11)', () => {
  it('cria conta na congregação em que o usuário escreve, e audita sem o nome', async () => {
    const bed = await aTestBed();

    const { id } = await bed.createAccount.execute(
      bed.context,
      treasurerOf(2),
      {
        congregationId: congId(2),
        name: '  Conta  do Banco ',
        kind: 'BANK',
      },
    );

    expect(await bed.accounts.findById(orgId(1), id as never)).toMatchObject({
      name: 'Conta do Banco',
      kind: 'BANK',
      congregationId: congId(2),
      status: 'ACTIVE',
    });
    expect(bed.audit.entries.at(-1)).toMatchObject({
      action: 'finance.account_created',
      metadata: { congregationId: congId(2), kind: 'BANK' },
    });
    expect(JSON.stringify(bed.audit.entries)).not.toContain('Banco');
  });

  it('recusa quem não escreve ali, tipo inválido, nome repetido e congregação desativada', async () => {
    const bed = await aTestBed();
    const create = (access = everything(), over = {}) =>
      rejectionOf(() =>
        bed.createAccount.execute(bed.context, access, {
          congregationId: congId(2),
          name: 'Nova',
          kind: 'CASH',
          ...over,
        }),
      );

    expect(await create(treasurerOf(1))).toBeInstanceOf(
      FinanceAccessDeniedError,
    );
    expect(await create(board())).toBeInstanceOf(FinanceAccessDeniedError);
    expect(await create(everything(), { kind: 'OURO' })).toBeInstanceOf(
      ValidationError,
    );
    expect(await create(everything(), { name: 'conta 3' })).toBeInstanceOf(
      AccountNameTakenError,
    );
    bed.congregations.set(orgId(1), congId(2), 'INACTIVE');
    expect(await create()).toBeInstanceOf(Error);
  });

  it('renomeia e arquiva (nunca apaga); sem escrita, não', async () => {
    const bed = await aTestBed();

    await bed.updateAccount.execute(bed.context, treasurerOf(1), {
      accountId: accountId(2),
      name: 'Banco principal',
      archived: true,
    });

    expect(await bed.accounts.findById(orgId(1), accountId(2))).toMatchObject({
      name: 'Banco principal',
      status: 'ARCHIVED',
    });
    expect(
      await rejectionOf(() =>
        bed.updateAccount.execute(bed.context, board(), {
          accountId: accountId(1),
          name: 'X',
        }),
      ),
    ).toBeInstanceOf(FinanceAccessDeniedError);
    expect(
      await rejectionOf(() =>
        bed.updateAccount.execute(bed.context, treasurerOf(2), {
          accountId: accountId(1),
          name: 'X',
        }),
      ),
    ).toBeInstanceOf(AccountNotFoundError);
  });

  it('lista só as contas do escopo, cada uma com o saldo CONFIRMADO', async () => {
    const bed = await aTestBed();
    await bed.recordIncome.execute(bed.context, everything(), {
      accountId: accountId(1),
      categoryId: categoryId(1),
      amountCents: 7_000,
      occurredOn: '2026-10-20',
    });
    await bed.recordIncome.execute(bed.context, everything(), {
      accountId: accountId(3),
      categoryId: categoryId(1),
      amountCents: 900,
      occurredOn: '2026-10-20',
    });
    await bed.requestExpense.execute(bed.context, everything(), {
      accountId: accountId(1),
      categoryId: categoryId(3),
      amountCents: 500,
      occurredOn: '2026-10-20',
    });

    const mine = await bed.listAccounts.execute(
      bed.context,
      treasurerOf(1),
      {},
    );
    const everyone = await bed.listAccounts.execute(
      bed.context,
      everything(),
      {},
    );
    const outside = await bed.listAccounts.execute(
      bed.context,
      treasurerOf(1),
      {
        congregationId: congId(2),
      },
    );

    expect(mine.map((a) => [a.id, a.balanceCents])).toEqual([
      [accountId(1), 7_000],
      [accountId(2), 0],
    ]);
    expect(everyone.map((a) => a.id)).toEqual([
      accountId(1),
      accountId(2),
      accountId(3),
      accountId(4),
    ]);
    expect(outside).toEqual([]);
  });
});

describe('categorias (UC-11)', () => {
  it('só quem gerencia as categorias da igreja cria e altera', async () => {
    const bed = await aTestBed();

    expect(
      await rejectionOf(() =>
        bed.createCategory.execute(bed.context, treasurerOf(1), {
          name: 'Missões',
          direction: 'OUT',
        }),
      ),
    ).toBeInstanceOf(FinanceAccessDeniedError);
    const { id } = await bed.createCategory.execute(bed.context, everything(), {
      name: 'Missões',
      direction: 'OUT',
    });
    await bed.updateCategory.execute(bed.context, everything(), {
      categoryId: id,
      name: 'Missões e evangelismo',
    });

    const list = await bed.listCategories.execute(bed.context, {});
    expect(list.map((c) => c.name)).toContain('Missões e evangelismo');
  });

  it('nome repetido no mesmo sentido é recusado; sentido inválido também', async () => {
    const bed = await aTestBed();

    expect(
      await rejectionOf(() =>
        bed.createCategory.execute(bed.context, everything(), {
          name: 'dízimo',
          direction: 'IN',
        }),
      ),
    ).toBeInstanceOf(CategoryNameTakenError);
    expect(
      await rejectionOf(() =>
        bed.createCategory.execute(bed.context, everything(), {
          name: 'Nova',
          direction: 'X',
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });

  it('as categorias padrão são criadas uma vez só (idempotente) e sem mexer nas existentes', async () => {
    const bed = await aTestBed();

    const first = await bed.ensureDefaultCategories.execute(
      bed.context,
      everything(),
    );
    const second = await bed.ensureDefaultCategories.execute(
      bed.context,
      everything(),
    );

    // "Dízimo", "Oferta" (entrada), "Aluguel" (saída) já existiam no cenário.
    expect(first.created).toBe(DEFAULT_CATEGORIES.length - 3);
    expect(second.created).toBe(0);
    expect(
      await rejectionOf(() =>
        bed.ensureDefaultCategories.execute(bed.context, treasurerOf(1)),
      ),
    ).toBeInstanceOf(FinanceAccessDeniedError);
  });

  it('categoria arquivada some da lista padrão, mas continua existindo', async () => {
    const bed = await aTestBed();
    await bed.updateCategory.execute(bed.context, everything(), {
      categoryId: categoryId(4),
      archived: true,
    });

    const active = await bed.listCategories.execute(bed.context, {});
    const all = await bed.listCategories.execute(bed.context, {
      includeArchived: true,
    });

    expect(active.map((c) => c.id)).not.toContain(categoryId(4));
    expect(all.map((c) => c.id)).toContain(categoryId(4));
  });
});

async function withEntries(bed: TestBed) {
  const base = { categoryId: categoryId(1), occurredOn: '2026-10-10' };
  const anonymous = await bed.recordIncome.execute(bed.context, everything(), {
    ...base,
    accountId: accountId(1),
    amountCents: 1_000,
  });
  const identified = await bed.recordIncome.execute(bed.context, everything(), {
    ...base,
    accountId: accountId(1),
    amountCents: 2_000,
    memberId: member(1),
    occurredOn: '2026-10-12',
  });
  const elsewhere = await bed.recordIncome.execute(bed.context, everything(), {
    ...base,
    accountId: accountId(3),
    amountCents: 3_000,
    memberId: member(2),
    occurredOn: '2026-10-14',
  });
  bed.audit.entries.length = 0;
  return {
    anonymous: anonymous.id,
    identified: identified.id,
    elsewhere: elsewhere.id,
  };
}

describe('ListEntriesUseCase', () => {
  it('só mostra as congregações do escopo, do mais recente ao mais antigo', async () => {
    const bed = await aTestBed();
    const ids = await withEntries(bed);

    const mine = await bed.listEntries.execute(bed.context, treasurerOf(1), {});
    const all = await bed.listEntries.execute(bed.context, everything(), {});

    expect(mine.items.map((e) => e.id)).toEqual([
      ids.identified,
      ids.anonymous,
    ]);
    expect(all.items.map((e) => e.id)).toEqual([
      ids.elsewhere,
      ids.identified,
      ids.anonymous,
    ]);
    expect(all.total).toBe(3);
  });

  it('filtro por congregação só ESTREITA o escopo: pedir a de outro devolve vazio', async () => {
    const bed = await aTestBed();
    await withEntries(bed);

    const page = await bed.listEntries.execute(bed.context, treasurerOf(1), {
      congregationId: congId(2),
    });

    expect(page).toMatchObject({ items: [], total: 0 });
  });

  it('QUEM contribuiu só aparece com read-individual; a leitura é auditada ANTES, sem nomes', async () => {
    const bed = await aTestBed();
    const ids = await withEntries(bed);
    const readerOnly = new FakeFinanceAccess({ read: 'ALL' });

    const hidden = await bed.listEntries.execute(bed.context, readerOnly, {});
    expect(bed.audit.entries).toEqual([]);
    const visible = await bed.listEntries.execute(
      bed.context,
      treasurerOf(1),
      {},
    );

    const hiddenEntry = hidden.items.find((e) => e.id === ids.identified);
    expect(hiddenEntry).toMatchObject({ memberLinked: true, member: null });
    expect(JSON.stringify(hidden)).not.toContain('Maria');
    expect(JSON.stringify(hidden)).not.toContain(member(1));
    expect(visible.items.find((e) => e.id === ids.identified)).toMatchObject({
      memberLinked: true,
      member: { id: member(1), name: 'Maria da Silva' },
    });
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'finance.contributors_viewed',
        metadata: { entries: 1 },
      }),
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toContain('Maria');
  });

  it('FALHA FECHADA: se a trilha não grava, a identidade não sai', async () => {
    const bed = await aTestBed();
    await withEntries(bed);
    bed.audit.failWith = new Error('trilha fora do ar');

    await expect(
      bed.listEntries.execute(bed.context, treasurerOf(1), {}),
    ).rejects.toThrow('trilha fora do ar');
    // Sem identidade a revelar, a lista não depende da trilha.
    await expect(
      bed.listEntries.execute(
        bed.context,
        new FakeFinanceAccess({ read: 'ALL' }),
        {},
      ),
    ).resolves.toBeDefined();
  });

  it('valida filtros e paginação', async () => {
    const bed = await aTestBed();
    const run = (query: object) =>
      rejectionOf(() =>
        bed.listEntries.execute(bed.context, everything(), query),
      );

    expect(await run({ limit: 0 })).toBeInstanceOf(ValidationError);
    expect(await run({ limit: 101 })).toBeInstanceOf(ValidationError);
    expect(await run({ offset: -1 })).toBeInstanceOf(ValidationError);
    expect(await run({ status: 'XYZ' })).toBeInstanceOf(ValidationError);
    expect(await run({ from: '2026-10-10', to: '2026-10-01' })).toBeInstanceOf(
      ValidationError,
    );
    expect(await run({ from: 'hoje' })).toBeInstanceOf(ValidationError);
  });

  it('filtra por conta, categoria, situação e período', async () => {
    const bed = await aTestBed();
    const ids = await withEntries(bed);

    const ofAccount = await bed.listEntries.execute(bed.context, everything(), {
      accountId: accountId(3),
    });
    const ofPeriod = await bed.listEntries.execute(bed.context, everything(), {
      from: '2026-10-11',
      to: '2026-10-13',
    });
    const pending = await bed.listEntries.execute(bed.context, everything(), {
      status: 'PENDING',
    });

    expect(ofAccount.items.map((e) => e.id)).toEqual([ids.elsewhere]);
    expect(ofPeriod.items.map((e) => e.id)).toEqual([ids.identified]);
    expect(pending.items).toEqual([]);
  });
});

describe('ListApprovalsUseCase (a fila da sede)', () => {
  it('mostra os pedidos pendentes de TODAS as congregações, só a quem alcança a sede', async () => {
    const bed = await aTestBed();
    await bed.recordIncome.execute(bed.context, everything(), {
      accountId: accountId(3),
      categoryId: categoryId(1),
      amountCents: 5_000,
      occurredOn: '2026-10-10',
    });
    const { id } = await bed.requestExpense.execute(
      bed.context,
      treasurerOf(2),
      {
        accountId: accountId(3),
        categoryId: categoryId(3),
        amountCents: 1_000,
        occurredOn: '2026-10-11',
      },
    );

    const queue = await bed.listApprovals.execute(bed.as(2), board(), {});

    expect(queue.items.map((e) => e.id)).toEqual([id]);
    for (const access of [
      treasurerOf(2),
      new FakeFinanceAccess({ read: 'ALL' }),
    ]) {
      expect(
        await rejectionOf(() =>
          bed.listApprovals.execute(bed.as(2), access, {}),
        ),
      ).toBeInstanceOf(ApprovalNotAllowedError);
    }
  });

  it('esconde quem contribuiu de quem aprova mas não tem read-individual', async () => {
    const bed = await aTestBed();
    const { id: income } = await bed.recordIncome.execute(
      bed.context,
      everything(),
      {
        accountId: accountId(1),
        categoryId: categoryId(1),
        amountCents: 5_000,
        occurredOn: '2026-10-10',
        memberId: member(1),
      },
    );
    await bed.requestReversal.execute(bed.context, everything(), {
      entryId: income,
      reason: 'erro',
    });

    const queue = await bed.listApprovals.execute(
      bed.as(2),
      new FakeFinanceAccess({ read: 'ALL', approve: 'ALL' }),
      {},
    );

    expect(queue.items[0]).toMatchObject({
      kind: 'REVERSAL',
      memberLinked: true,
      member: null,
    });
  });
});

describe('ListTransferDestinationsUseCase', () => {
  it('da filial, o destino é a sede; da sede, são as outras congregações (sem saldos)', async () => {
    const bed = await aTestBed();

    const fromBranch = await bed.listDestinations.execute(
      bed.context,
      treasurerOf(2),
      {
        fromAccountId: accountId(3),
      },
    );
    const fromHeadquarters = await bed.listDestinations.execute(
      bed.context,
      treasurerOf(1),
      {
        fromAccountId: accountId(1),
      },
    );

    expect(fromBranch.map((a) => a.id)).toEqual([accountId(1), accountId(2)]);
    expect(fromHeadquarters.map((a) => a.id)).toEqual([
      accountId(3),
      accountId(4),
    ]);
    expect(fromBranch[0]).not.toHaveProperty('balanceCents');
  });

  it('quem não escreve na conta de origem não recebe nada', async () => {
    const bed = await aTestBed();

    expect(
      await bed.listDestinations.execute(bed.context, board(), {
        fromAccountId: accountId(3),
      }),
    ).toEqual([]);
    expect(
      await bed.listDestinations.execute(bed.context, treasurerOf(2), {
        fromAccountId: accountId(10),
      }),
    ).toEqual([]);
  });
});

describe('GetDashboardUseCase (UC-15 e UC-16)', () => {
  async function aMonth(bed: TestBed) {
    const rec = (
      account: number,
      category: number,
      cents: number,
      day: string,
    ) =>
      bed.recordIncome.execute(bed.context, everything(), {
        accountId: accountId(account),
        categoryId: categoryId(category),
        amountCents: cents,
        occurredOn: day,
      });
    await rec(1, 1, 10_000, '2026-10-05'); // dízimo da sede
    await rec(1, 2, 2_000, '2026-10-06'); // oferta da sede
    await rec(3, 1, 6_000, '2026-10-07'); // dízimo da filial 2
    await rec(1, 1, 500, '2026-09-30'); // mês anterior
    const spend = async (account: number, cents: number) => {
      const { id } = await bed.requestExpense.execute(
        bed.context,
        everything(),
        {
          accountId: accountId(account),
          categoryId: categoryId(3),
          amountCents: cents,
          occurredOn: '2026-10-08',
        },
      );
      await bed.approve.execute(bed.as(9), board(), { entryId: id });
    };
    await spend(1, 3_000);
    await bed.requestExpense.execute(bed.context, everything(), {
      accountId: accountId(1),
      categoryId: categoryId(3),
      amountCents: 100,
      occurredOn: '2026-10-09',
    }); // fica pendente
  }

  it('soma receita, despesa, resultado e saldo; o padrão é o mês atual', async () => {
    const bed = await aTestBed();
    await aMonth(bed);

    const view = await bed.dashboard.execute(bed.context, everything(), {});

    expect(view.period).toEqual({ from: '2026-10-01', to: '2026-10-22' });
    expect(view.scope).toBe('ORGANIZATION');
    expect(view.totals).toMatchObject({
      incomeCents: 18_000,
      expenseCents: 3_000,
      resultCents: 15_000,
    });
    // Saldo de sempre: inclui setembro (500) e desconta a saída aprovada; o pendente não conta.
    expect(view.totalBalanceCents).toBe(18_500 - 3_000);
    expect(view.pendingApprovals).toBe(1);
    expect(view.byCategory).toEqual([
      { categoryId: categoryId(1), direction: 'IN', totalCents: 16_000 },
      { categoryId: categoryId(2), direction: 'IN', totalCents: 2_000 },
      { categoryId: categoryId(3), direction: 'OUT', totalCents: 3_000 },
    ]);
    expect(view.byCongregation).toEqual([
      {
        congregationId: congId(1),
        incomeCents: 12_000,
        expenseCents: 3_000,
        balanceCents: 9_500,
      },
      {
        congregationId: congId(2),
        incomeCents: 6_000,
        expenseCents: 0,
        balanceCents: 6_000,
      },
    ]);
  });

  it('um período escolhido recorta só aquele intervalo', async () => {
    const bed = await aTestBed();
    await aMonth(bed);

    const view = await bed.dashboard.execute(bed.context, everything(), {
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(view.totals).toMatchObject({ incomeCents: 500, expenseCents: 0 });
  });

  it('o escopo manda: tesoureiro só soma a própria congregação; congregação alheia é recusada', async () => {
    const bed = await aTestBed();
    await aMonth(bed);

    const view = await bed.dashboard.execute(bed.context, treasurerOf(2), {});

    expect(view.scope).toBe('CONGREGATIONS');
    expect(view.totals.incomeCents).toBe(6_000);
    expect(view.accountBalances).toEqual([
      { accountId: accountId(3), balanceCents: 6_000 },
    ]);
    expect(
      await rejectionOf(() =>
        bed.dashboard.execute(bed.context, treasurerOf(2), {
          congregationId: congId(1),
        }),
      ),
    ).toBeInstanceOf(FinanceAccessDeniedError);
    const narrowed = await bed.dashboard.execute(bed.context, everything(), {
      congregationId: congId(2),
    });
    expect(narrowed.totals.incomeCents).toBe(6_000);
  });

  it('o estorno desconta da categoria de origem; repasse e saldo inicial ficam à parte', async () => {
    const bed = await aTestBed();
    const { id: tithe } = await bed.recordIncome.execute(
      bed.context,
      everything(),
      {
        accountId: accountId(1),
        categoryId: categoryId(1),
        amountCents: 8_000,
        occurredOn: '2026-10-05',
      },
    );
    const { id: reversal } = await bed.requestReversal.execute(
      bed.context,
      everything(),
      {
        entryId: tithe,
        reason: 'erro',
      },
    );
    await bed.approve.execute(bed.as(9), board(), { entryId: reversal });
    const { id: opening } = await bed.requestOpeningBalance.execute(
      bed.context,
      everything(),
      {
        accountId: accountId(2),
        amountCents: 1_000,
        occurredOn: '2026-10-01',
      },
    );
    await bed.approve.execute(bed.as(9), board(), { entryId: opening });
    await bed.recordIncome.execute(bed.context, everything(), {
      accountId: accountId(3),
      categoryId: categoryId(1),
      amountCents: 4_000,
      occurredOn: '2026-10-06',
    });
    const { transferId } = await bed.requestTransfer.execute(
      bed.context,
      everything(),
      {
        fromAccountId: accountId(3),
        toAccountId: accountId(1),
        amountCents: 4_000,
        occurredOn: '2026-10-07',
      },
    );
    const [leg] = await bed.entries.findByTransferId(
      orgId(1),
      transferId as never,
    );
    await bed.approve.execute(bed.as(9), board(), {
      entryId: leg?.id as string,
    });

    const view = await bed.dashboard.execute(bed.context, everything(), {});

    expect(view.totals).toEqual({
      incomeCents: 4_000,
      expenseCents: 0,
      resultCents: 4_000,
      transferInCents: 4_000,
      transferOutCents: 4_000,
      openingBalanceCents: 1_000,
    });
    expect(view.byCategory).toEqual([
      { categoryId: categoryId(1), direction: 'IN', totalCents: 4_000 },
    ]);
    // Na igreja toda, o repasse se anula: o saldo é só a entrada de 4.000 + saldo inicial de 1.000.
    expect(view.totalBalanceCents).toBe(5_000);
  });

  it('valida o período', async () => {
    const bed = await aTestBed();

    expect(
      await rejectionOf(() =>
        bed.dashboard.execute(bed.context, everything(), {
          from: '2026-10-10',
          to: '2026-10-01',
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });
});

describe('extrato de contribuição do membro', () => {
  async function aGivingMember(bed: TestBed) {
    const give = (
      account: number,
      cents: number,
      day: string,
      memberNumber = 1,
    ) =>
      bed.recordIncome.execute(bed.context, everything(), {
        accountId: accountId(account),
        categoryId: categoryId(1),
        amountCents: cents,
        occurredOn: day,
        memberId: member(memberNumber),
      });
    await give(1, 1_000, '2025-01-10');
    const { id } = await give(1, 2_000, '2026-09-10');
    await give(3, 500, '2026-10-01');
    await give(1, 9_999, '2026-10-02', 3);
    await bed.requestReversal
      .execute(bed.context, everything(), { entryId: id, reason: 'erro' })
      .then(({ id: reversal }) =>
        bed.approve.execute(bed.as(9), board(), { entryId: reversal }),
      );
    bed.audit.entries.length = 0;
  }

  it('devolve o extrato líquido de todo o período e audita ANTES, com o membro como entidade', async () => {
    const bed = await aTestBed();
    await aGivingMember(bed);

    const view = await bed.contributions.execute(bed.context, everything(), {
      memberId: member(1),
    });

    expect(view.member).toEqual({ id: member(1), name: 'Maria da Silva' });
    expect(view.netCents).toBe(1_000 + 2_000 - 2_000 + 500);
    expect(view.items).toHaveLength(4);
    expect(
      (view.items[0]?.occurredOn ?? '') >=
        (view.items.at(-1)?.occurredOn ?? ''),
    ).toBe(true);
    expect(view.byCategory).toEqual([
      { categoryId: categoryId(1), netCents: 1_500 },
    ]);
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'finance.member_contributions_viewed',
        entity: 'member',
        entityId: member(1),
        metadata: { entries: 4, windowed: false },
      }),
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toContain('Maria');
  });

  it('a janela `since` recorta o período', async () => {
    const bed = await aTestBed();
    await aGivingMember(bed);

    const view = await bed.contributions.execute(bed.context, everything(), {
      memberId: member(1),
      since: '2026-09-01',
    });

    expect(view.items).toHaveLength(3);
    expect(view.netCents).toBe(500);
    expect(view.since).toBe('2026-09-01');
  });

  it('só enxerga o que está nas congregações com read-individual do usuário', async () => {
    const bed = await aTestBed();
    await aGivingMember(bed);

    const view = await bed.contributions.execute(bed.context, treasurerOf(2), {
      memberId: member(1),
    });

    expect(view.items.map((i) => i.congregationId)).toEqual([congId(2)]);
    expect(view.netCents).toBe(500);
  });

  it('membro inexistente, de outra igreja, ou fora do escopo e sem nada visível: o mesmo "indisponível"', async () => {
    const bed = await aTestBed();
    await aGivingMember(bed);
    const lookup = (
      context: typeof bed.context,
      access = everything(),
      memberId = member(1),
    ) =>
      rejectionOf(() =>
        bed.contributions.execute(context, access, { memberId }),
      );

    expect(await lookup(bed.context, everything(), member(404))).toBeInstanceOf(
      ContributorNotFoundError,
    );
    expect(await lookup(bed.as(1, 2))).toBeInstanceOf(ContributorNotFoundError);
    // Membro 3 é da congregação 1 e só contribuiu lá; o tesoureiro da 2 não deve nem saber que existe.
    expect(await lookup(bed.context, treasurerOf(2), member(3))).toBeInstanceOf(
      ContributorNotFoundError,
    );
    expect(bed.audit.entries).toEqual([]);
  });

  it('FALHA FECHADA: sem trilha, o extrato não sai', async () => {
    const bed = await aTestBed();
    await aGivingMember(bed);
    bed.audit.failWith = new Error('trilha fora do ar');

    await expect(
      bed.contributions.execute(bed.context, everything(), {
        memberId: member(1),
      }),
    ).rejects.toThrow('trilha fora do ar');
  });
});

describe('SearchContributorsUseCase (busca mínima)', () => {
  it('acha por parte do nome, só nas congregações com read-individual, e audita sem o termo', async () => {
    const bed = await aTestBed();

    const found = await bed.searchContributors.execute(
      bed.context,
      treasurerOf(1),
      {
        search: 'SILVA',
      },
    );
    const none = await bed.searchContributors.execute(
      bed.context,
      treasurerOf(2),
      {
        search: 'silva',
      },
    );

    expect(found).toEqual([
      { id: member(1), fullName: 'Maria da Silva', congregationId: congId(1) },
    ]);
    expect(none).toEqual([]);
    expect(bed.audit.entries[0]).toMatchObject({
      action: 'finance.contributors_searched',
      metadata: { returned: 1 },
    });
    expect(JSON.stringify(bed.audit.entries)).not.toContain('SILVA');
  });

  it('exige termo de 2 a 100 caracteres e limite razoável', async () => {
    const bed = await aTestBed();
    const run = (query: { search: string; limit?: number }) =>
      rejectionOf(() =>
        bed.searchContributors.execute(bed.context, everything(), query),
      );

    expect(await run({ search: 'a' })).toBeInstanceOf(ValidationError);
    expect(await run({ search: 'a'.repeat(101) })).toBeInstanceOf(
      ValidationError,
    );
    expect(await run({ search: 'ma', limit: 21 })).toBeInstanceOf(
      ValidationError,
    );
  });

  it('FALHA FECHADA: sem trilha, a lista de nomes não sai', async () => {
    const bed = await aTestBed();
    bed.audit.failWith = new Error('trilha fora do ar');

    await expect(
      bed.searchContributors.execute(bed.context, everything(), {
        search: 'maria',
      }),
    ).rejects.toThrow('trilha fora do ar');
  });
});
