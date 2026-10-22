import type { CalendarDate } from '../../../../shared/domain/calendar-date.js';
import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import type {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import {
  AccountNameTakenError,
  AccountNotFoundError,
  AlreadyReversedError,
  CategoryNameTakenError,
  CategoryNotFoundError,
  EntryNotFoundError,
  EntryNotPendingError,
  InsufficientBalanceError,
} from '../errors.js';
import { FinanceCategory } from '../finance-category.js';
import type {
  AccountRepository,
  AggregateRow,
  CategoryRepository,
  EntryPage,
  EntryRepository,
  EntrySearchCriteria,
} from '../finance.repositories.js';
import { FinancialAccount } from '../financial-account.js';
import type { AccountId, CategoryId, EntryId, TransferId } from '../ids.js';
import type { LedgerEntry, MemberRef } from '../ledger-entry.js';

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const inScope = (
  allowed: ReadonlySet<CongregationId> | null,
  congregationId: CongregationId,
): boolean => allowed === null || allowed.has(congregationId);

const toSet = (
  ids: readonly CongregationId[] | null,
): ReadonlySet<CongregationId> | null => (ids === null ? null : new Set(ids));

const inRange = (
  entry: LedgerEntry,
  from: CalendarDate | null,
  to: CalendarDate | null,
): boolean =>
  (from === null || entry.occurredOn.value >= from.value) &&
  (to === null || entry.occurredOn.value <= to.value);

/** Mais recente primeiro: data do fato, depois id (desempate estável). */
const newestFirst = (a: LedgerEntry, b: LedgerEntry): number =>
  b.occurredOn.value.localeCompare(a.occurredOn.value) ||
  b.id.localeCompare(a.id);

/** Repositório de contas em memória: guarda CÓPIAS e aplica o travamento otimista por versão. */
export class InMemoryAccountRepository implements AccountRepository {
  readonly #store = new Map<string, FinancialAccount>();

  findById(
    organizationId: OrganizationId,
    id: AccountId,
  ): Promise<FinancialAccount | null> {
    const stored = this.#store.get(id);
    return Promise.resolve(
      stored && stored.organizationId === organizationId
        ? copyAccount(stored, stored.version)
        : null,
    );
  }

  add(account: FinancialAccount): Promise<void> {
    if (this.#nameTaken(account)) {
      return Promise.reject(new AccountNameTakenError());
    }
    this.#store.set(account.id, copyAccount(account, account.version));
    return Promise.resolve();
  }

  save(account: FinancialAccount): Promise<void> {
    const stored = this.#store.get(account.id);
    if (!stored || stored.organizationId !== account.organizationId) {
      return Promise.reject(new AccountNotFoundError());
    }
    if (stored.version !== account.version) {
      return Promise.reject(new ConcurrencyConflictError());
    }
    if (this.#nameTaken(account)) {
      return Promise.reject(new AccountNameTakenError());
    }
    this.#store.set(account.id, copyAccount(account, account.version + 1));
    return Promise.resolve();
  }

  list(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      includeArchived: boolean;
    },
  ): Promise<FinancialAccount[]> {
    const allowed = toSet(criteria.congregationIds);
    return Promise.resolve(
      [...this.#store.values()]
        .filter(
          (a) =>
            a.organizationId === organizationId &&
            inScope(allowed, a.congregationId) &&
            (criteria.includeArchived || a.isActive),
        )
        .sort(
          (a, b) =>
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
            a.id.localeCompare(b.id),
        )
        .map((a) => copyAccount(a, a.version)),
    );
  }

  #nameTaken(account: FinancialAccount): boolean {
    return [...this.#store.values()].some(
      (other) =>
        other.id !== account.id &&
        other.organizationId === account.organizationId &&
        other.congregationId === account.congregationId &&
        sameName(other.name, account.name),
    );
  }
}

function copyAccount(account: FinancialAccount, version: number) {
  return FinancialAccount.restore({
    id: account.id,
    organizationId: account.organizationId,
    congregationId: account.congregationId,
    name: account.name,
    kind: account.kind,
    status: account.status,
    version,
  });
}

/** Repositório de categorias em memória (mesmas regras de nome único e de versão). */
export class InMemoryCategoryRepository implements CategoryRepository {
  readonly #store = new Map<string, FinanceCategory>();

  findById(
    organizationId: OrganizationId,
    id: CategoryId,
  ): Promise<FinanceCategory | null> {
    const stored = this.#store.get(id);
    return Promise.resolve(
      stored && stored.organizationId === organizationId
        ? copyCategory(stored, stored.version)
        : null,
    );
  }

  add(category: FinanceCategory): Promise<void> {
    if (this.#nameTaken(category)) {
      return Promise.reject(new CategoryNameTakenError());
    }
    this.#store.set(category.id, copyCategory(category, category.version));
    return Promise.resolve();
  }

  save(category: FinanceCategory): Promise<void> {
    const stored = this.#store.get(category.id);
    if (!stored || stored.organizationId !== category.organizationId) {
      return Promise.reject(new CategoryNotFoundError());
    }
    if (stored.version !== category.version) {
      return Promise.reject(new ConcurrencyConflictError());
    }
    if (this.#nameTaken(category)) {
      return Promise.reject(new CategoryNameTakenError());
    }
    this.#store.set(category.id, copyCategory(category, category.version + 1));
    return Promise.resolve();
  }

  list(
    organizationId: OrganizationId,
    criteria: { includeArchived: boolean },
  ): Promise<FinanceCategory[]> {
    return Promise.resolve(
      [...this.#store.values()]
        .filter(
          (c) =>
            c.organizationId === organizationId &&
            (criteria.includeArchived || c.isActive),
        )
        .sort(
          (a, b) =>
            a.direction.localeCompare(b.direction) ||
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
            a.id.localeCompare(b.id),
        )
        .map((c) => copyCategory(c, c.version)),
    );
  }

  #nameTaken(category: FinanceCategory): boolean {
    return [...this.#store.values()].some(
      (other) =>
        other.id !== category.id &&
        other.organizationId === category.organizationId &&
        other.direction === category.direction &&
        sameName(other.name, category.name),
    );
  }
}

function copyCategory(category: FinanceCategory, version: number) {
  return FinanceCategory.restore({
    id: category.id,
    organizationId: category.organizationId,
    name: category.name,
    direction: category.direction,
    status: category.status,
    version,
  });
}

/**
 * Livro-razão em memória. Os lançamentos são imutáveis (cada decisão devolve OUTRO objeto), então guardar a referência é
 * seguro. Imita o banco: estorno único, decisão só de pendente e saldo nunca negativo ao confirmar.
 */
export class InMemoryEntryRepository implements EntryRepository {
  readonly #store = new Map<string, LedgerEntry>();

  findById(
    organizationId: OrganizationId,
    id: EntryId,
  ): Promise<LedgerEntry | null> {
    const stored = this.#store.get(id);
    return Promise.resolve(
      stored && stored.organizationId === organizationId ? stored : null,
    );
  }

  findByTransferId(
    organizationId: OrganizationId,
    transferId: TransferId,
  ): Promise<LedgerEntry[]> {
    return Promise.resolve(
      [...this.#store.values()]
        .filter(
          (e) =>
            e.organizationId === organizationId && e.transferId === transferId,
        )
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  }

  add(entries: readonly LedgerEntry[]): Promise<void> {
    // Tudo ou nada: valida o lote inteiro antes de gravar qualquer um.
    const reversed = new Set<string>();
    for (const entry of entries) {
      const target = entry.reversesEntryId;
      if (target === null) continue;
      const taken =
        reversed.has(target) ||
        [...this.#store.values()].some(
          (other) =>
            other.reversesEntryId === target &&
            (other.status === 'PENDING' || other.status === 'CONFIRMED'),
        );
      if (taken) return Promise.reject(new AlreadyReversedError());
      reversed.add(target);
    }
    for (const entry of entries) this.#store.set(entry.id, entry);
    return Promise.resolve();
  }

  decide(entries: readonly LedgerEntry[]): Promise<void> {
    const next = new Map(this.#store);
    for (const decided of entries) {
      const current = this.#store.get(decided.id);
      if (!current || current.organizationId !== decided.organizationId) {
        return Promise.reject(new EntryNotFoundError());
      }
      if (!current.isPending || decided.isPending) {
        return Promise.reject(new EntryNotPendingError());
      }
      next.set(decided.id, decided);
    }

    // O saldo é conferido depois de aplicar o lote inteiro (as duas pernas de um repasse juntas).
    const touched = new Set<AccountId>(
      entries
        .filter((e) => e.isConfirmed && e.direction === 'OUT')
        .map((e) => e.accountId),
    );
    for (const accountId of touched) {
      const balance = [...next.values()]
        .filter((e) => e.accountId === accountId && e.isConfirmed)
        .reduce((sum, e) => sum + e.signedCents, 0);
      if (balance < 0) return Promise.reject(new InsufficientBalanceError());
    }

    for (const [id, entry] of next) this.#store.set(id, entry);
    return Promise.resolve();
  }

  search(
    organizationId: OrganizationId,
    criteria: EntrySearchCriteria,
  ): Promise<EntryPage> {
    const allowed = toSet(criteria.congregationIds);
    const matches = [...this.#store.values()]
      .filter(
        (e) =>
          e.organizationId === organizationId &&
          inScope(allowed, e.congregationId) &&
          (criteria.accountId === null || e.accountId === criteria.accountId) &&
          (criteria.status === null || e.status === criteria.status) &&
          (criteria.categoryId === null ||
            e.categoryId === criteria.categoryId) &&
          inRange(e, criteria.from, criteria.to),
      )
      .sort(newestFirst);

    return Promise.resolve({
      total: matches.length,
      items: matches.slice(criteria.offset, criteria.offset + criteria.limit),
    });
  }

  aggregate(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      from: CalendarDate | null;
      to: CalendarDate | null;
    },
  ): Promise<AggregateRow[]> {
    const allowed = toSet(criteria.congregationIds);
    const groups = new Map<string, AggregateRow>();
    for (const e of this.#store.values()) {
      if (
        e.organizationId !== organizationId ||
        !e.isConfirmed ||
        !inScope(allowed, e.congregationId) ||
        !inRange(e, criteria.from, criteria.to)
      ) {
        continue;
      }
      const key = [
        e.congregationId,
        e.accountId,
        e.categoryId ?? '-',
        e.kind,
        e.direction,
      ].join('|');
      const row = groups.get(key) ?? {
        congregationId: e.congregationId,
        accountId: e.accountId,
        categoryId: e.categoryId,
        kind: e.kind,
        direction: e.direction,
        totalCents: 0,
        count: 0,
      };
      row.totalCents += e.amount.cents;
      row.count += 1;
      groups.set(key, row);
    }
    return Promise.resolve([...groups.values()]);
  }

  countPending(
    organizationId: OrganizationId,
    congregationIds: readonly CongregationId[] | null,
  ): Promise<number> {
    const allowed = toSet(congregationIds);
    return Promise.resolve(
      [...this.#store.values()].filter(
        (e) =>
          e.organizationId === organizationId &&
          e.isPending &&
          inScope(allowed, e.congregationId),
      ).length,
    );
  }

  listByMember(
    organizationId: OrganizationId,
    memberId: MemberRef,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      since: CalendarDate | null;
    },
  ): Promise<LedgerEntry[]> {
    const allowed = toSet(criteria.congregationIds);
    return Promise.resolve(
      [...this.#store.values()]
        .filter(
          (e) =>
            e.organizationId === organizationId &&
            e.isConfirmed &&
            e.memberId === memberId &&
            inScope(allowed, e.congregationId) &&
            inRange(e, criteria.since, null),
        )
        .sort(newestFirst),
    );
  }
}
