import type { CongregationId } from '../../../shared/domain/identifiers.js';
import type { EntryDirection } from '../domain/finance-category.js';
import type { FinanceCategory } from '../domain/finance-category.js';
import type {
  AccountKind,
  ArchiveStatus,
  FinancialAccount,
} from '../domain/financial-account.js';
import type {
  EntryKind,
  EntryStatus,
  LedgerEntry,
} from '../domain/ledger-entry.js';

export interface AccountView {
  id: string;
  congregationId: string;
  name: string;
  kind: AccountKind;
  status: ArchiveStatus;
  /** Soma dos lançamentos CONFIRMADOS (ADR 0005): o saldo nunca é guardado, é calculado. */
  balanceCents: number;
}

export function toAccountView(
  account: FinancialAccount,
  balanceCents: number,
): AccountView {
  return {
    id: account.id,
    congregationId: account.congregationId,
    name: account.name,
    kind: account.kind,
    status: account.status,
    balanceCents,
  };
}

export interface CategoryView {
  id: string;
  name: string;
  direction: EntryDirection;
  status: ArchiveStatus;
}

export function toCategoryView(category: FinanceCategory): CategoryView {
  return {
    id: category.id,
    name: category.name,
    direction: category.direction,
    status: category.status,
  };
}

export interface EntryView {
  id: string;
  congregationId: string;
  accountId: string;
  kind: EntryKind;
  direction: EntryDirection;
  amountCents: number;
  occurredOn: string;
  description: string | null;
  categoryId: string | null;
  /** Há um membro ligado? Qualquer leitor sabe; QUEM é só aparece com `finance:read-individual` (ADR 0015, item 7). */
  memberLinked: boolean;
  member: { id: string; name: string | null } | null;
  transferId: string | null;
  reversesEntryId: string | null;
  status: EntryStatus;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export function toEntryView(
  entry: LedgerEntry,
  member: { id: string; name: string | null } | null,
): EntryView {
  return {
    id: entry.id,
    congregationId: entry.congregationId,
    accountId: entry.accountId,
    kind: entry.kind,
    direction: entry.direction,
    amountCents: entry.amount.cents,
    occurredOn: entry.occurredOn.value,
    description: entry.description,
    categoryId: entry.categoryId,
    memberLinked: entry.memberId !== null,
    member,
    transferId: entry.transferId,
    reversesEntryId: entry.reversesEntryId,
    status: entry.status,
    requestedBy: entry.requestedBy,
    requestedAt: entry.requestedAt.toISOString(),
    decidedBy: entry.decidedBy,
    decidedAt: entry.decidedAt?.toISOString() ?? null,
    decisionNote: entry.decisionNote,
  };
}

export interface EntryListView {
  items: EntryView[];
  total: number;
  limit: number;
  offset: number;
}

export type CongregationScope = readonly CongregationId[] | null;
