import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import {
  ApprovalNotAllowedError,
  EntryNotFoundError,
  EntryNotPendingError,
  FinanceAccessDeniedError,
  InsufficientBalanceError,
  SelfApprovalError,
} from '../domain/errors.js';
import {
  NOW,
  accountId,
  actor,
  categoryId,
  congId,
  orgId,
  transferId,
} from '../domain/testing/fixtures.js';
import {
  FakeFinanceAccess,
  aTestBed,
  board,
  everything,
  treasurerOf,
  type TestBed,
} from './testing/test-bed.js';

/** Pessoa 1 (padrão do contexto) lança 10.000 de entrada e pede uma saída de `cents`; devolve o id da saída. */
async function aPendingExpense(bed: TestBed, cents = 4_000, account = 1) {
  await bed.recordIncome.execute(bed.context, everything(), {
    accountId: accountId(account),
    categoryId: categoryId(1),
    amountCents: 10_000,
    occurredOn: '2026-10-20',
  });
  const { id } = await bed.requestExpense.execute(bed.context, everything(), {
    accountId: accountId(account),
    categoryId: categoryId(3),
    amountCents: cents,
    occurredOn: '2026-10-21',
  });
  return id;
}

const balanceOf = async (bed: TestBed, account: number) =>
  (
    await bed.listAccounts.execute(bed.context, everything(), {
      includeArchived: true,
    })
  ).find((a) => a.id === accountId(account))?.balanceCents;

describe('ApproveEntryUseCase', () => {
  it('OUTRA pessoa da sede aprova: a saída vale, o saldo cai e a decisão é auditada', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    await bed.approve.execute(bed.as(2), board(), { entryId: id });

    expect(await bed.find(id)).toMatchObject({
      status: 'CONFIRMED',
      requestedBy: actor(1),
      decidedBy: actor(2),
      decidedAt: NOW,
    });
    expect(await balanceOf(bed, 1)).toBe(6_000);
    expect(bed.audit.entries.at(-1)).toMatchObject({
      action: 'finance.entry_approved',
      entityId: id,
      actorId: actor(2),
      metadata: { amountCents: 4_000, direction: 'OUT', kind: 'ORDINARY' },
    });
  });

  it('SEPARAÇÃO DE FUNÇÕES: quem pediu não aprova o próprio pedido, nem sendo Administrador', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    await expect(
      bed.approve.execute(bed.context, everything(), { entryId: id }),
    ).rejects.toBeInstanceOf(SelfApprovalError);
    expect((await bed.find(id))?.status).toBe('PENDING');
  });

  it('só quem alcança a SEDE aprova: filial e Tesoureiro não', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);
    const branchLeader = new FakeFinanceAccess({
      read: [congId(2)],
      approve: [congId(2)],
    });

    for (const access of [
      branchLeader,
      treasurerOf(1),
      new FakeFinanceAccess({ read: 'ALL' }),
    ]) {
      expect(
        await rejectionOf(() =>
          bed.approve.execute(bed.as(2), access, { entryId: id }),
        ),
      ).toBeInstanceOf(ApprovalNotAllowedError);
    }
    // O Dirigente da sede aprova (alcança só a sede, e basta).
    await bed.approve.execute(
      bed.as(2),
      new FakeFinanceAccess({ read: [congId(1)], approve: [congId(1)] }),
      { entryId: id },
    );
  });

  it('sem sede cadastrada ninguém aprova', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);
    // A igreja 3 não tem sede cadastrada.
    const other = bed.as(2, 3);

    expect(
      await rejectionOf(() =>
        bed.approve.execute(other, everything(), { entryId: id }),
      ),
    ).toBeInstanceOf(ApprovalNotAllowedError);
  });

  it('pedido inexistente ou de outra igreja é "não encontrado"', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);
    bed.congregations.set(orgId(2), congId(10), 'ACTIVE', true);

    expect(
      await rejectionOf(() =>
        bed.approve.execute(bed.as(2), board(), { entryId: transferId(404) }),
      ),
    ).toBeInstanceOf(EntryNotFoundError);
    expect(
      await rejectionOf(() =>
        bed.approve.execute(bed.as(2, 2), board(), { entryId: id }),
      ),
    ).toBeInstanceOf(EntryNotFoundError);
    expect((await bed.find(id))?.status).toBe('PENDING');
  });

  it('o saldo NUNCA fica negativo: a aprovação é recusada e o pedido segue pendente', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed, 10_001);

    await expect(
      bed.approve.execute(bed.as(2), board(), { entryId: id }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    expect((await bed.find(id))?.status).toBe('PENDING');
    expect(await balanceOf(bed, 1)).toBe(10_000);
    expect(
      bed.audit.entries.some((e) => e.action === 'finance.entry_approved'),
    ).toBe(false);
  });

  it('duas saídas que juntas passam do saldo: a segunda aprovação falha', async () => {
    const bed = await aTestBed();
    const first = await aPendingExpense(bed, 7_000);
    const { id: second } = await bed.requestExpense.execute(
      bed.context,
      everything(),
      {
        accountId: accountId(1),
        categoryId: categoryId(3),
        amountCents: 7_000,
        occurredOn: '2026-10-21',
      },
    );

    await bed.approve.execute(bed.as(2), board(), { entryId: first });

    await expect(
      bed.approve.execute(bed.as(2), board(), { entryId: second }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
  });

  it('o saldo inicial, depois de aprovado, dá fundos para saídas', async () => {
    const bed = await aTestBed();
    const { id: opening } = await bed.requestOpeningBalance.execute(
      bed.context,
      everything(),
      {
        accountId: accountId(2),
        amountCents: 20_000,
        occurredOn: '2026-10-01',
      },
    );
    const { id: expense } = await bed.requestExpense.execute(
      bed.context,
      everything(),
      {
        accountId: accountId(2),
        categoryId: categoryId(3),
        amountCents: 5_000,
        occurredOn: '2026-10-05',
      },
    );

    await expect(
      bed.approve.execute(bed.as(2), board(), { entryId: expense }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    await bed.approve.execute(bed.as(2), board(), { entryId: opening });
    await bed.approve.execute(bed.as(2), board(), { entryId: expense });

    expect(await balanceOf(bed, 2)).toBe(15_000);
  });

  it('o estorno de uma entrada, aprovado, tira o dinheiro do caixa', async () => {
    const bed = await aTestBed();
    const { id: original } = await bed.recordIncome.execute(
      bed.context,
      everything(),
      {
        accountId: accountId(1),
        categoryId: categoryId(1),
        amountCents: 3_000,
        occurredOn: '2026-10-20',
      },
    );
    const { id: reversal } = await bed.requestReversal.execute(
      bed.context,
      everything(),
      {
        entryId: original,
        reason: 'erro de digitação',
      },
    );
    expect(await balanceOf(bed, 1)).toBe(3_000);

    await bed.approve.execute(bed.as(2), board(), { entryId: reversal });

    expect(await balanceOf(bed, 1)).toBe(0);
  });

  it('não se decide duas vezes', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);
    await bed.approve.execute(bed.as(2), board(), { entryId: id });

    for (const run of [
      () => bed.approve.execute(bed.as(3), board(), { entryId: id }),
      () =>
        bed.reject.execute(bed.as(3), board(), {
          entryId: id,
          note: 'tarde demais',
        }),
    ]) {
      expect(await rejectionOf(run)).toBeInstanceOf(EntryNotPendingError);
    }
  });
});

describe('RejectEntryUseCase', () => {
  it('recusa com motivo, sem mexer no saldo, e audita', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    await bed.reject.execute(bed.as(2), board(), {
      entryId: id,
      note: ' Sem  nota fiscal ',
    });

    expect(await bed.find(id)).toMatchObject({
      status: 'REJECTED',
      decidedBy: actor(2),
      decisionNote: 'Sem nota fiscal',
    });
    expect(await balanceOf(bed, 1)).toBe(10_000);
    expect(bed.audit.entries.at(-1)).toMatchObject({
      action: 'finance.entry_rejected',
      entityId: id,
    });
    expect(JSON.stringify(bed.audit.entries)).not.toContain('nota fiscal');
  });

  it('o motivo é obrigatório e a recusa de si mesmo é proibida', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    await expect(
      bed.reject.execute(bed.as(2), board(), { entryId: id, note: '   ' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      bed.reject.execute(bed.context, everything(), {
        entryId: id,
        note: 'não quero',
      }),
    ).rejects.toBeInstanceOf(SelfApprovalError);
    expect((await bed.find(id))?.status).toBe('PENDING');
  });

  it('só a sede recusa', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    await expect(
      bed.reject.execute(bed.as(2), treasurerOf(1), { entryId: id, note: 'x' }),
    ).rejects.toBeInstanceOf(ApprovalNotAllowedError);
  });
});

describe('repasse: a sede decide as duas pernas juntas', () => {
  async function aPendingTransfer(bed: TestBed, withFunds: boolean) {
    if (withFunds) {
      await bed.recordIncome.execute(bed.context, everything(), {
        accountId: accountId(3),
        categoryId: categoryId(1),
        amountCents: 9_000,
        occurredOn: '2026-10-20',
      });
    }
    const { transferId: id } = await bed.requestTransfer.execute(
      bed.context,
      everything(),
      {
        fromAccountId: accountId(3),
        toAccountId: accountId(1),
        amountCents: 6_000,
        occurredOn: '2026-10-21',
      },
    );
    return bed.entries.findByTransferId(orgId(1), id as never);
  }

  it('aprovar UMA perna confirma as DUAS e move o dinheiro de uma conta para a outra', async () => {
    const bed = await aTestBed();
    const [first] = await aPendingTransfer(bed, true);

    await bed.approve.execute(bed.as(2), board(), {
      entryId: first?.id as string,
    });

    const legs = await bed.entries.findByTransferId(
      orgId(1),
      first?.transferId as never,
    );
    expect(legs.map((l) => l.status)).toEqual(['CONFIRMED', 'CONFIRMED']);
    expect(await balanceOf(bed, 3)).toBe(3_000);
    expect(await balanceOf(bed, 1)).toBe(6_000);
    expect(
      bed.audit.entries.filter((e) => e.action === 'finance.entry_approved'),
    ).toHaveLength(2);
  });

  it('sem saldo na origem, NENHUMA perna é confirmada', async () => {
    const bed = await aTestBed();
    const [first] = await aPendingTransfer(bed, false);

    await expect(
      bed.approve.execute(bed.as(2), board(), { entryId: first?.id as string }),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);

    const legs = await bed.entries.findByTransferId(
      orgId(1),
      first?.transferId as never,
    );
    expect(legs.map((l) => l.status)).toEqual(['PENDING', 'PENDING']);
    expect(await balanceOf(bed, 1)).toBe(0);
  });

  it('recusar o repasse recusa as duas pernas', async () => {
    const bed = await aTestBed();
    const [first] = await aPendingTransfer(bed, true);

    await bed.reject.execute(bed.as(2), board(), {
      entryId: first?.id as string,
      note: 'valor errado',
    });

    const legs = await bed.entries.findByTransferId(
      orgId(1),
      first?.transferId as never,
    );
    expect(legs.map((l) => l.status)).toEqual(['REJECTED', 'REJECTED']);
  });

  it('cancelar o repasse cancela as duas pernas', async () => {
    const bed = await aTestBed();
    const [first] = await aPendingTransfer(bed, true);

    await bed.cancel.execute(bed.context, treasurerOf(2), {
      entryId: first?.id as string,
    });

    const legs = await bed.entries.findByTransferId(
      orgId(1),
      first?.transferId as never,
    );
    expect(legs.map((l) => l.status)).toEqual(['CANCELLED', 'CANCELLED']);
  });
});

describe('CancelEntryUseCase', () => {
  it('quem pediu desiste do próprio pedido, sem registrar decisor', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    await bed.cancel.execute(bed.context, treasurerOf(1), { entryId: id });

    expect(await bed.find(id)).toMatchObject({
      status: 'CANCELLED',
      decidedBy: null,
      decidedAt: NOW,
    });
    expect(bed.audit.entries.at(-1)).toMatchObject({
      action: 'finance.entry_cancelled',
      entityId: id,
    });
  });

  it('outra pessoa com escrita na congregação também cancela; sem escrita, não', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    expect(
      await rejectionOf(() =>
        bed.cancel.execute(bed.as(2), board(), { entryId: id }),
      ),
    ).toBeInstanceOf(FinanceAccessDeniedError);
    await bed.cancel.execute(bed.as(2), treasurerOf(1), { entryId: id });
  });

  it('quem não enxerga a congregação recebe "não encontrado"; o que já foi decidido não cancela', async () => {
    const bed = await aTestBed();
    const id = await aPendingExpense(bed);

    expect(
      await rejectionOf(() =>
        bed.cancel.execute(bed.as(2), treasurerOf(2), { entryId: id }),
      ),
    ).toBeInstanceOf(EntryNotFoundError);

    await bed.approve.execute(bed.as(2), board(), { entryId: id });
    expect(
      await rejectionOf(() =>
        bed.cancel.execute(bed.context, everything(), { entryId: id }),
      ),
    ).toBeInstanceOf(EntryNotPendingError);
  });
});
