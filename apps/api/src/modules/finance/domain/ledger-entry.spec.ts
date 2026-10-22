import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import {
  EntryNotPendingError,
  NotReversibleError,
  SelfApprovalError,
  TransferSameCongregationError,
} from './errors.js';
import { LedgerEntry } from './ledger-entry.js';
import { Money } from './money.js';
import {
  NOW,
  MINUTE,
  accountId,
  actor,
  after,
  anExpense,
  anIncome,
  anOpeningBalance,
  approved,
  categoryId,
  congId,
  date,
  entryId,
  member,
  money,
  orgId,
  transferId,
} from './testing/fixtures.js';

describe('Money', () => {
  it('aceita centavos inteiros e positivos', () => {
    expect(Money.ofCents(1).cents).toBe(1);
    expect(Money.ofCents(10_000_000_000).cents).toBe(10_000_000_000);
  });

  it.each([
    0,
    -1,
    0.5,
    10.1,
    10_000_000_001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    2 ** 53,
  ])('recusa %s', (cents) => {
    expect(thrownBy(() => Money.ofCents(cents))).toBeInstanceOf(
      ValidationError,
    );
  });

  it('compara por valor', () => {
    expect(Money.ofCents(5).equals(Money.ofCents(5))).toBe(true);
    expect(Money.ofCents(5).equals(Money.ofCents(6))).toBe(false);
  });
});

describe('entrada comum (recordIncome)', () => {
  it('vale na hora, sem decisor, e soma ao saldo', () => {
    const entry = anIncome({ cents: 12_345 });

    expect(entry).toMatchObject({
      kind: 'ORDINARY',
      direction: 'IN',
      status: 'CONFIRMED',
      decidedBy: null,
      decidedAt: null,
      signedCents: 12_345,
      requestedAt: NOW,
    });
  });

  it('pode ser anônima ou identificada por membro', () => {
    expect(anIncome().memberId).toBeNull();
    expect(anIncome({ member: 5 }).memberId).toBe(member(5));
  });

  it('a descrição é aparada, opcional e limitada', () => {
    expect(anIncome({ description: '  Culto   de domingo ' }).description).toBe(
      'Culto de domingo',
    );
    expect(anIncome({ description: '   ' }).description).toBeNull();
    expect(
      thrownBy(() => anIncome({ description: 'x'.repeat(201) })),
    ).toBeInstanceOf(ValidationError);
  });

  it('a data do fato pode ser passada (hoje incluso), nunca futura', () => {
    expect(anIncome({ occurredOn: '2020-01-01' }).occurredOn.value).toBe(
      '2020-01-01',
    );
    expect(anIncome({ occurredOn: '2026-10-22' }).occurredOn.value).toBe(
      '2026-10-22',
    );
    expect(
      thrownBy(() => anIncome({ occurredOn: '2026-10-23' })),
    ).toBeInstanceOf(ValidationError);
  });
});

describe('pedido de saída (requestExpense)', () => {
  it('nasce PENDENTE: ainda não é dinheiro e subtrai quando confirmada', () => {
    const entry = anExpense({ cents: 5_000 });

    expect(entry).toMatchObject({
      kind: 'ORDINARY',
      direction: 'OUT',
      status: 'PENDING',
      isConfirmed: false,
      signedCents: -5_000,
    });
  });
});

describe('saldo inicial (requestOpeningBalance)', () => {
  it('é entrada pendente, sem categoria nem membro', () => {
    expect(anOpeningBalance({ cents: 100_000 })).toMatchObject({
      kind: 'OPENING_BALANCE',
      direction: 'IN',
      status: 'PENDING',
      categoryId: null,
      memberId: null,
    });
  });
});

describe('aprovação (separação de funções)', () => {
  it('outra pessoa aprova: vira confirmada e registra quem e quando', () => {
    const confirmed = anExpense({ by: 1 }).approve(
      actor(2),
      after(NOW, MINUTE),
    );

    expect(confirmed).toMatchObject({
      status: 'CONFIRMED',
      decidedBy: actor(2),
      decidedAt: after(NOW, MINUTE),
      isConfirmed: true,
    });
  });

  it('QUEM PEDIU não aprova nem recusa o próprio pedido', () => {
    const entry = anExpense({ by: 1 });

    expect(thrownBy(() => entry.approve(actor(1), NOW))).toBeInstanceOf(
      SelfApprovalError,
    );
    expect(
      thrownBy(() => entry.reject(actor(1), 'não quero', NOW)),
    ).toBeInstanceOf(SelfApprovalError);
  });

  it('recusar exige motivo, e guarda motivo e decisor', () => {
    const entry = anExpense({ by: 1 });

    expect(thrownBy(() => entry.reject(actor(2), '   ', NOW))).toBeInstanceOf(
      ValidationError,
    );
    expect(entry.reject(actor(2), '  Sem   nota fiscal ', NOW)).toMatchObject({
      status: 'REJECTED',
      decidedBy: actor(2),
      decisionNote: 'Sem nota fiscal',
    });
  });

  it('o original não muda: decidir devolve OUTRO lançamento (imutável)', () => {
    const entry = anExpense();

    entry.approve(actor(2), NOW);

    expect(entry.status).toBe('PENDING');
  });

  it('o que já foi decidido não se decide de novo', () => {
    const confirmed = approved(anExpense());
    const rejected = anExpense().reject(actor(2), 'não', NOW);

    for (const entry of [confirmed, rejected, anIncome()]) {
      expect(thrownBy(() => entry.approve(actor(3), NOW))).toBeInstanceOf(
        EntryNotPendingError,
      );
      expect(thrownBy(() => entry.reject(actor(3), 'x', NOW))).toBeInstanceOf(
        EntryNotPendingError,
      );
      expect(thrownBy(() => entry.cancel(NOW))).toBeInstanceOf(
        EntryNotPendingError,
      );
    }
  });

  it('cancelar um pendente não registra decisor (quem pediu pode desistir)', () => {
    const cancelled = anExpense({ by: 1 }).cancel(after(NOW, MINUTE));

    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      decidedBy: null,
      decidedAt: after(NOW, MINUTE),
      decisionNote: null,
    });
  });
});

describe('repasse (requestTransfer)', () => {
  const transfer = (overrides: { toCongregation?: number } = {}) =>
    LedgerEntry.requestTransfer({
      transferId: transferId(1),
      organizationId: orgId(),
      from: {
        id: entryId(1),
        congregationId: congId(2),
        accountId: accountId(3),
      },
      to: {
        id: entryId(2),
        congregationId: congId(overrides.toCongregation ?? 1),
        accountId: accountId(1),
      },
      amount: money(50_000),
      occurredOn: date('2026-10-20'),
      description: 'Repasse de outubro',
      requestedBy: actor(1),
      now: NOW,
    });

  it('gera duas pernas pendentes e ligadas: sai de uma conta, entra na outra', () => {
    const { out, in: incoming } = transfer();

    expect(out).toMatchObject({
      kind: 'TRANSFER',
      direction: 'OUT',
      status: 'PENDING',
      accountId: accountId(3),
      congregationId: congId(2),
    });
    expect(incoming).toMatchObject({
      kind: 'TRANSFER',
      direction: 'IN',
      status: 'PENDING',
      accountId: accountId(1),
      congregationId: congId(1),
    });
    expect(out.transferId).toBe(transferId(1));
    expect(incoming.transferId).toBe(transferId(1));
    expect(out.amount.equals(incoming.amount)).toBe(true);
    expect(out.signedCents + incoming.signedCents).toBe(0);
  });

  it('é entre congregações DIFERENTES', () => {
    expect(thrownBy(() => transfer({ toCongregation: 2 }))).toBeInstanceOf(
      TransferSameCongregationError,
    );
  });
});

describe('estorno (requestReversal)', () => {
  const reversal = (original: LedgerEntry, by = 2) =>
    LedgerEntry.requestReversal(original, {
      id: entryId(50),
      occurredOn: date('2026-10-21'),
      reason: 'Lançado em duplicidade',
      requestedBy: actor(by),
      now: NOW,
    });

  it('de uma entrada: saída pendente, mesma conta, valor, categoria e membro, ligada ao original', () => {
    const original = anIncome({ cents: 8_000, member: 3, category: 2 });

    const entry = reversal(original);

    expect(entry).toMatchObject({
      kind: 'REVERSAL',
      direction: 'OUT',
      status: 'PENDING',
      accountId: original.accountId,
      congregationId: original.congregationId,
      categoryId: categoryId(2),
      memberId: member(3),
      reversesEntryId: original.id,
      description: 'Lançado em duplicidade',
    });
    expect(entry.amount.equals(original.amount)).toBe(true);
    expect(entry.signedCents + original.signedCents).toBe(0);
  });

  it('de uma saída confirmada: entrada de volta', () => {
    const entry = reversal(approved(anExpense({ cents: 3_000 })));

    expect(entry).toMatchObject({ direction: 'IN', kind: 'REVERSAL' });
  });

  it('o saldo inicial também pode ser estornado', () => {
    expect(reversal(approved(anOpeningBalance())).kind).toBe('REVERSAL');
  });

  it.each([
    ['pendente', () => anExpense()],
    ['recusado', () => anExpense().reject(actor(2), 'não', NOW)],
    ['cancelado', () => anExpense().cancel(NOW)],
  ])('não se estorna lançamento %s', (_nome, make) => {
    expect(thrownBy(() => reversal(make()))).toBeInstanceOf(NotReversibleError);
  });

  it('não se estorna um estorno nem uma perna de repasse', () => {
    const aReversal = approved(reversal(anIncome()), 9);
    const { out } = LedgerEntry.requestTransfer({
      transferId: transferId(1),
      organizationId: orgId(),
      from: {
        id: entryId(1),
        congregationId: congId(2),
        accountId: accountId(3),
      },
      to: {
        id: entryId(2),
        congregationId: congId(1),
        accountId: accountId(1),
      },
      amount: money(100),
      occurredOn: date('2026-10-20'),
      requestedBy: actor(1),
      now: NOW,
    });

    expect(thrownBy(() => reversal(aReversal))).toBeInstanceOf(
      NotReversibleError,
    );
    expect(thrownBy(() => reversal(approved(out)))).toBeInstanceOf(
      NotReversibleError,
    );
  });

  it('a data do estorno não pode ser anterior à do lançamento estornado', () => {
    const original = anIncome({ occurredOn: '2026-10-20' });

    expect(
      thrownBy(() =>
        LedgerEntry.requestReversal(original, {
          id: entryId(50),
          occurredOn: date('2026-10-19'),
          requestedBy: actor(2),
          now: NOW,
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });
});
