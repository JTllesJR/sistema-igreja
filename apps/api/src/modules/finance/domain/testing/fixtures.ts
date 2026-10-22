import { CalendarDate } from '../../../../shared/domain/calendar-date.js';
import {
  ActorId,
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { FinanceCategory } from '../finance-category.js';
import { FinancialAccount, type AccountKind } from '../financial-account.js';
import { AccountId, CategoryId, EntryId, TransferId } from '../ids.js';
import { LedgerEntry, MemberRef } from '../ledger-entry.js';
import { Money } from '../money.js';

export const orgId = (n = 1): OrganizationId => OrganizationId.of(uuidFor(n));
export const congId = (n: number): CongregationId =>
  CongregationId.of(uuidFor(1000 + n));
export const accountId = (n: number): AccountId =>
  AccountId.of(uuidFor(2000 + n));
export const categoryId = (n: number): CategoryId =>
  CategoryId.of(uuidFor(3000 + n));
export const entryId = (n: number): EntryId => EntryId.of(uuidFor(4000 + n));
export const transferId = (n: number): TransferId =>
  TransferId.of(uuidFor(5000 + n));
export const actor = (n: number): ActorId => ActorId.of(uuidFor(6000 + n));
export const member = (n: number): MemberRef => MemberRef.of(uuidFor(7000 + n));

/** Instante fixo dos testes; o domínio nunca lê o relógio, recebe `now`. */
export const NOW = new Date('2026-10-22T12:00:00.000Z');
export const MINUTE = 60_000;
export const after = (from: Date, ms: number): Date =>
  new Date(from.getTime() + ms);
export const date = (raw: string): CalendarDate =>
  CalendarDate.parse(raw, 'date');
export const money = (cents: number): Money => Money.ofCents(cents);

/**
 * Cenário do banco: a igreja 1 tem as congregações 1 (sede), 2 e 3; a igreja 2 tem a 10. As contas 1 e 2 são da
 * congregação 1, a 3 da 2, a 4 da 3, e a 10 da congregação 10 (igreja 2). Categorias: 1 e 2 de entrada, 3 e 4 de saída
 * (igreja 1) e 10 (entrada, igreja 2).
 */
export const aConfiguration = {
  accounts: [
    { n: 1, congregation: 1, organization: 1, kind: 'CASH' as AccountKind },
    { n: 2, congregation: 1, organization: 1, kind: 'BANK' as AccountKind },
    { n: 3, congregation: 2, organization: 1, kind: 'CASH' as AccountKind },
    { n: 4, congregation: 3, organization: 1, kind: 'CASH' as AccountKind },
    { n: 10, congregation: 10, organization: 2, kind: 'CASH' as AccountKind },
  ],
  categories: [
    { n: 1, organization: 1, direction: 'IN' as const, name: 'Dízimo' },
    { n: 2, organization: 1, direction: 'IN' as const, name: 'Oferta' },
    { n: 3, organization: 1, direction: 'OUT' as const, name: 'Aluguel' },
    { n: 4, organization: 1, direction: 'OUT' as const, name: 'Manutenção' },
    { n: 10, organization: 2, direction: 'IN' as const, name: 'Dízimo' },
  ],
};

export const anAccount = (n: number): FinancialAccount => {
  const spec = aConfiguration.accounts.find((a) => a.n === n);
  if (!spec) throw new Error(`conta ${n} não existe no cenário`);
  return FinancialAccount.register({
    id: accountId(n),
    organizationId: orgId(spec.organization),
    congregationId: congId(spec.congregation),
    name: `Conta ${n}`,
    kind: spec.kind,
  });
};

export const aCategory = (n: number): FinanceCategory => {
  const spec = aConfiguration.categories.find((c) => c.n === n);
  if (!spec) throw new Error(`categoria ${n} não existe no cenário`);
  return FinanceCategory.register({
    id: categoryId(n),
    organizationId: orgId(spec.organization),
    name: spec.name,
    direction: spec.direction,
  });
};

const accountSpec = (n: number) => {
  const spec = aConfiguration.accounts.find((a) => a.n === n);
  if (!spec) throw new Error(`conta ${n} não existe no cenário`);
  return spec;
};

interface EntryOptions {
  id?: number;
  account?: number;
  cents?: number;
  category?: number;
  occurredOn?: string;
  by?: number;
  at?: Date;
  member?: number;
  description?: string;
}

const base = (o: EntryOptions, defaultCategory: number) => {
  const account = accountSpec(o.account ?? 1);
  return {
    id: entryId(o.id ?? 1),
    organizationId: orgId(account.organization),
    congregationId: congId(account.congregation),
    accountId: accountId(account.n),
    amount: money(o.cents ?? 10_000),
    occurredOn: date(o.occurredOn ?? '2026-10-20'),
    description: o.description ?? null,
    requestedBy: actor(o.by ?? 1),
    now: o.at ?? NOW,
    categoryId: categoryId(o.category ?? defaultCategory),
  };
};

/** Entrada comum (nasce CONFIRMADA). */
export const anIncome = (o: EntryOptions = {}): LedgerEntry =>
  LedgerEntry.recordIncome({
    ...base(o, 1),
    memberId: o.member === undefined ? null : member(o.member),
  });

/** Pedido de saída (nasce PENDENTE). */
export const anExpense = (o: EntryOptions = {}): LedgerEntry =>
  LedgerEntry.requestExpense(base(o, 3));

/** Saldo inicial (nasce PENDENTE). */
export const anOpeningBalance = (o: EntryOptions = {}): LedgerEntry => {
  const { categoryId: _category, ...rest } = base(o, 1);
  return LedgerEntry.requestOpeningBalance(rest);
};

/** Entrada JÁ confirmada com o valor dado, para preparar saldo nos testes. */
export const confirmedIncome = (o: EntryOptions = {}): LedgerEntry =>
  anIncome(o);

/** Um pedido pendente já aprovado por `approver` (padrão: a pessoa 9). */
export const approved = (
  entry: LedgerEntry,
  approver = 9,
  at = after(NOW, MINUTE),
): LedgerEntry => entry.approve(actor(approver), at);
