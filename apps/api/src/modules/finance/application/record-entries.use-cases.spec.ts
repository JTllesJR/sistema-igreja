import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import {
  AccountNotFoundError,
  AccountUnavailableError,
  AlreadyReversedError,
  CategoryNotFoundError,
  CategoryUnavailableError,
  CongregationUnavailableError,
  EntryNotFoundError,
  FinanceAccessDeniedError,
  MemberUnavailableError,
  NotReversibleError,
  TransferRequiresHeadquartersError,
  TransferSameCongregationError,
} from '../domain/errors.js';
import {
  accountId,
  actor,
  categoryId,
  congId,
  member,
  orgId,
} from '../domain/testing/fixtures.js';
import {
  aTestBed,
  board,
  everything,
  FakeFinanceAccess,
  treasurerOf,
} from './testing/test-bed.js';

const income = {
  accountId: accountId(1),
  categoryId: categoryId(1),
  amountCents: 10_000,
  occurredOn: '2026-10-20',
};

describe('RecordIncomeUseCase (UC-12)', () => {
  it('registra a entrada JÁ confirmada, com quem pediu, e audita sem dado pessoal', async () => {
    const bed = await aTestBed();

    const { id } = await bed.recordIncome.execute(bed.context, treasurerOf(1), {
      ...income,
      description: ' Culto  de domingo ',
    });

    expect(await bed.find(id)).toMatchObject({
      status: 'CONFIRMED',
      kind: 'ORDINARY',
      direction: 'IN',
      congregationId: congId(1),
      requestedBy: actor(1),
      description: 'Culto de domingo',
      memberId: null,
    });
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'finance.income_recorded',
        entityId: id,
        metadata: {
          congregationId: congId(1),
          amountCents: 10_000,
          identified: false,
        },
      }),
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toContain('Culto');
  });

  it('o dízimo pode ser identificado: liga o membro, com permissão para ver contribuição individual', async () => {
    const bed = await aTestBed();

    const { id } = await bed.recordIncome.execute(bed.context, treasurerOf(1), {
      ...income,
      memberId: member(1),
    });

    expect((await bed.find(id))?.memberId).toBe(member(1));
    expect(bed.audit.entries[0]?.metadata).toMatchObject({ identified: true });
    expect(JSON.stringify(bed.audit.entries)).not.toContain(member(1));
  });

  it('quem lança mas NÃO vê contribuição individual não pode ligar um membro', async () => {
    const bed = await aTestBed();
    const noIndividual = new FakeFinanceAccess({
      read: [congId(1)],
      write: [congId(1)],
    });

    await expect(
      bed.recordIncome.execute(bed.context, noIndividual, {
        ...income,
        memberId: member(1),
      }),
    ).rejects.toBeInstanceOf(FinanceAccessDeniedError);
    await bed.recordIncome.execute(bed.context, noIndividual, income);
  });

  it('o membro precisa existir NESTA igreja', async () => {
    const bed = await aTestBed();

    await expect(
      bed.recordIncome.execute(bed.context, everything(), {
        ...income,
        memberId: member(404),
      }),
    ).rejects.toBeInstanceOf(MemberUnavailableError);
  });

  it('exige escrita na congregação da conta; conta que não enxerga é "não encontrada"', async () => {
    const bed = await aTestBed();

    // Tesoureiro da congregação 2 tentando lançar na conta da congregação 1.
    expect(
      await rejectionOf(() =>
        bed.recordIncome.execute(bed.context, treasurerOf(2), income),
      ),
    ).toBeInstanceOf(AccountNotFoundError);
    // Lê mas não escreve.
    expect(
      await rejectionOf(() =>
        bed.recordIncome.execute(bed.context, board(), income),
      ),
    ).toBeInstanceOf(FinanceAccessDeniedError);
    expect((await bed.entries.search(orgId(1), allCriteria)).total).toBe(0);
  });

  it('não lança em conta de outra igreja', async () => {
    const bed = await aTestBed();

    await expect(
      bed.recordIncome.execute(bed.context, everything(), {
        ...income,
        accountId: accountId(10),
        categoryId: categoryId(10),
      }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });

  it('a categoria precisa ser da igreja, ativa e de ENTRADA', async () => {
    const bed = await aTestBed();
    const archived = await bed.categories.findById(orgId(1), categoryId(2));
    archived?.archive();
    await bed.categories.save(archived as NonNullable<typeof archived>);

    const attempt = (categoryId_: string) =>
      rejectionOf(() =>
        bed.recordIncome.execute(bed.context, everything(), {
          ...income,
          categoryId: categoryId_,
        }),
      );

    expect(await attempt(categoryId(3))).toBeInstanceOf(
      CategoryUnavailableError,
    );
    expect(await attempt(categoryId(2))).toBeInstanceOf(
      CategoryUnavailableError,
    );
    expect(await attempt(categoryId(10))).toBeInstanceOf(CategoryNotFoundError);
  });

  it('conta arquivada e congregação desativada não recebem lançamentos', async () => {
    const bed = await aTestBed();
    const account = await bed.accounts.findById(orgId(1), accountId(3));
    account?.archive();
    await bed.accounts.save(account as NonNullable<typeof account>);
    bed.congregations.set(orgId(1), congId(3), 'INACTIVE');

    expect(
      await rejectionOf(() =>
        bed.recordIncome.execute(bed.context, everything(), {
          ...income,
          accountId: accountId(3),
        }),
      ),
    ).toBeInstanceOf(AccountUnavailableError);
    expect(
      await rejectionOf(() =>
        bed.recordIncome.execute(bed.context, everything(), {
          ...income,
          accountId: accountId(4),
        }),
      ),
    ).toBeInstanceOf(CongregationUnavailableError);
  });

  it.each([0, -5, 1.5, 10_000_000_001])(
    'recusa o valor %s',
    async (amountCents) => {
      const bed = await aTestBed();

      await expect(
        bed.recordIncome.execute(bed.context, everything(), {
          ...income,
          amountCents,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    },
  );

  it('recusa data futura ou inválida', async () => {
    const bed = await aTestBed();

    for (const occurredOn of ['2026-10-23', '2026-02-30', 'ontem']) {
      await expect(
        bed.recordIncome.execute(bed.context, everything(), {
          ...income,
          occurredOn,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('se a trilha falha depois de gravar, o erro sobe (não some em silêncio)', async () => {
    const bed = await aTestBed();
    bed.audit.failWith = new Error('trilha fora do ar');

    await expect(
      bed.recordIncome.execute(bed.context, everything(), income),
    ).rejects.toThrow('trilha fora do ar');
  });
});

const allCriteria = {
  congregationIds: null,
  accountId: null,
  status: null,
  categoryId: null,
  from: null,
  to: null,
  limit: 50,
  offset: 0,
};

describe('RequestExpenseUseCase (UC-13)', () => {
  const expense = {
    accountId: accountId(1),
    categoryId: categoryId(3),
    amountCents: 4_000,
    occurredOn: '2026-10-20',
  };

  it('nasce PENDENTE: não mexe no saldo e espera a sede', async () => {
    const bed = await aTestBed();
    await bed.recordIncome.execute(bed.context, everything(), income);

    const { id } = await bed.requestExpense.execute(
      bed.context,
      treasurerOf(1),
      expense,
    );

    expect(await bed.find(id)).toMatchObject({
      status: 'PENDING',
      direction: 'OUT',
      decidedBy: null,
    });
    const [account] = await bed.listAccounts.execute(
      bed.context,
      everything(),
      {
        congregationId: congId(1),
      },
    );
    expect(account?.balanceCents).toBe(10_000);
    expect(bed.audit.entries.at(-1)).toMatchObject({
      action: 'finance.expense_requested',
      metadata: { amountCents: 4_000 },
    });
  });

  it('a categoria precisa ser de SAÍDA', async () => {
    const bed = await aTestBed();

    await expect(
      bed.requestExpense.execute(bed.context, everything(), {
        ...expense,
        categoryId: categoryId(1),
      }),
    ).rejects.toBeInstanceOf(CategoryUnavailableError);
  });

  it('exige escrita na congregação', async () => {
    const bed = await aTestBed();

    await expect(
      bed.requestExpense.execute(bed.context, board(), expense),
    ).rejects.toBeInstanceOf(FinanceAccessDeniedError);
    await expect(
      bed.requestExpense.execute(bed.context, treasurerOf(2), expense),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});

describe('RequestOpeningBalanceUseCase', () => {
  it('o saldo inicial nasce pendente e só vale depois da sede', async () => {
    const bed = await aTestBed();

    const { id } = await bed.requestOpeningBalance.execute(
      bed.context,
      treasurerOf(1),
      {
        accountId: accountId(1),
        amountCents: 50_000,
        occurredOn: '2026-10-01',
      },
    );

    expect(await bed.find(id)).toMatchObject({
      kind: 'OPENING_BALANCE',
      status: 'PENDING',
      direction: 'IN',
    });
  });
});

describe('RequestTransferUseCase (repasse)', () => {
  const transfer = {
    fromAccountId: accountId(3),
    toAccountId: accountId(1),
    amountCents: 5_000,
    occurredOn: '2026-10-20',
  };

  it('gera as duas pernas pendentes, ligadas, e audita o repasse', async () => {
    const bed = await aTestBed();

    const { transferId } = await bed.requestTransfer.execute(
      bed.context,
      treasurerOf(2),
      transfer,
    );

    const legs = await bed.entries.findByTransferId(
      orgId(1),
      transferId as never,
    );
    expect(legs).toHaveLength(2);
    expect(legs.map((l) => l.status)).toEqual(['PENDING', 'PENDING']);
    expect(legs.map((l) => l.direction).sort()).toEqual(['IN', 'OUT']);
    expect(bed.audit.entries.at(-1)).toMatchObject({
      action: 'finance.transfer_requested',
      entity: 'transfer',
      entityId: transferId,
      metadata: {
        fromCongregationId: congId(2),
        toCongregationId: congId(1),
        amountCents: 5_000,
      },
    });
  });

  it('exige escrita na congregação de ORIGEM, mesmo sem ver o destino', async () => {
    const bed = await aTestBed();

    expect(
      await rejectionOf(() =>
        bed.requestTransfer.execute(bed.context, treasurerOf(1), transfer),
      ),
    ).toBeInstanceOf(AccountNotFoundError);
    // Tesoureiro da sede repassando para a congregação 2 (que não vê): vale.
    await bed.requestTransfer.execute(bed.context, treasurerOf(1), {
      ...transfer,
      fromAccountId: accountId(1),
      toAccountId: accountId(3),
    });
  });

  it('uma ponta precisa ser a sede: entre duas filiais não pode', async () => {
    const bed = await aTestBed();

    await expect(
      bed.requestTransfer.execute(bed.context, everything(), {
        ...transfer,
        toAccountId: accountId(4),
      }),
    ).rejects.toBeInstanceOf(TransferRequiresHeadquartersError);
  });

  it('não é entre contas da MESMA congregação, nem para conta de outra igreja', async () => {
    const bed = await aTestBed();

    await expect(
      bed.requestTransfer.execute(bed.context, everything(), {
        ...transfer,
        fromAccountId: accountId(1),
        toAccountId: accountId(2),
      }),
    ).rejects.toBeInstanceOf(TransferSameCongregationError);
    // Duas contas de uma FILIAL: o erro é "mesma congregação", não "falta a sede".
    const { id: second } = await bed.createAccount.execute(
      bed.context,
      everything(),
      { congregationId: congId(2), name: 'Banco da filial', kind: 'BANK' },
    );
    await expect(
      bed.requestTransfer.execute(bed.context, everything(), {
        ...transfer,
        toAccountId: second,
      }),
    ).rejects.toBeInstanceOf(TransferSameCongregationError);
    await expect(
      bed.requestTransfer.execute(bed.context, everything(), {
        ...transfer,
        toAccountId: accountId(10),
      }),
    ).rejects.toBeInstanceOf(AccountNotFoundError);
  });
});

describe('RequestReversalUseCase (UC-14)', () => {
  it('estorna uma entrada confirmada: cria saída pendente ligada ao original, sem apagar nada', async () => {
    const bed = await aTestBed();
    const { id: original } = await bed.recordIncome.execute(
      bed.context,
      everything(),
      { ...income, memberId: member(1) },
    );

    const { id } = await bed.requestReversal.execute(bed.as(2), everything(), {
      entryId: original,
      reason: ' Lançado em duplicidade ',
    });

    expect(await bed.find(id)).toMatchObject({
      kind: 'REVERSAL',
      status: 'PENDING',
      direction: 'OUT',
      reversesEntryId: original,
      memberId: member(1),
      description: 'Lançado em duplicidade',
      occurredOn: expect.objectContaining({ value: '2026-10-22' }),
    });
    expect((await bed.find(original))?.status).toBe('CONFIRMED');
    expect(bed.audit.entries.at(-1)).toMatchObject({
      action: 'finance.reversal_requested',
      metadata: { reverses: original, amountCents: 10_000 },
    });
  });

  it('exige motivo', async () => {
    const bed = await aTestBed();
    const { id } = await bed.recordIncome.execute(
      bed.context,
      everything(),
      income,
    );

    await expect(
      bed.requestReversal.execute(bed.context, everything(), {
        entryId: id,
        reason: '  ',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('só uma vez por lançamento', async () => {
    const bed = await aTestBed();
    const { id } = await bed.recordIncome.execute(
      bed.context,
      everything(),
      income,
    );
    await bed.requestReversal.execute(bed.context, everything(), {
      entryId: id,
      reason: 'erro',
    });

    await expect(
      bed.requestReversal.execute(bed.context, everything(), {
        entryId: id,
        reason: 'de novo',
      }),
    ).rejects.toBeInstanceOf(AlreadyReversedError);
  });

  it('não estorna pendente nem perna de repasse', async () => {
    const bed = await aTestBed();
    const { id } = await bed.requestExpense.execute(bed.context, everything(), {
      accountId: accountId(1),
      categoryId: categoryId(3),
      amountCents: 100,
      occurredOn: '2026-10-20',
    });

    await expect(
      bed.requestReversal.execute(bed.context, everything(), {
        entryId: id,
        reason: 'x',
      }),
    ).rejects.toBeInstanceOf(NotReversibleError);
  });

  it('exige escrita; congregação que não vê é "não encontrado"; outra igreja também', async () => {
    const bed = await aTestBed();
    const { id } = await bed.recordIncome.execute(
      bed.context,
      everything(),
      income,
    );
    const reverse = (context = bed.context, access = everything()) =>
      rejectionOf(() =>
        bed.requestReversal.execute(context, access, {
          entryId: id,
          reason: 'x',
        }),
      );

    expect(await reverse(bed.context, board())).toBeInstanceOf(
      FinanceAccessDeniedError,
    );
    expect(await reverse(bed.context, treasurerOf(2))).toBeInstanceOf(
      EntryNotFoundError,
    );
    expect(await reverse(bed.as(1, 2))).toBeInstanceOf(EntryNotFoundError);
  });
});
