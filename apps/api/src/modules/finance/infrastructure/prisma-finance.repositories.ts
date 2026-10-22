import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import {
  ActorId,
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import {
  AccountNameTakenError,
  AccountNotFoundError,
  AlreadyReversedError,
  CategoryNameTakenError,
  CategoryNotFoundError,
  EntryNotFoundError,
  EntryNotPendingError,
  InsufficientBalanceError,
} from '../domain/errors.js';
import { FinanceCategory } from '../domain/finance-category.js';
import type {
  AccountRepository,
  AggregateRow,
  CategoryRepository,
  EntryPage,
  EntryRepository,
  EntrySearchCriteria,
} from '../domain/finance.repositories.js';
import { FinancialAccount } from '../domain/financial-account.js';
import { AccountId, CategoryId, EntryId, TransferId } from '../domain/ids.js';
import { LedgerEntry, MemberRef } from '../domain/ledger-entry.js';
import { Money } from '../domain/money.js';

type AccountRow = Prisma.FinancialAccountGetPayload<object>;
type CategoryRow = Prisma.FinanceCategoryGetPayload<object>;
type EntryRow = Prisma.FinancialEntryGetPayload<object>;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

/** O ESCOPO do usuário entra na própria consulta. Lista vazia = `IN ()` = nenhuma linha; `null` = a igreja toda. */
const inScope = (ids: readonly CongregationId[] | null) =>
  ids === null ? {} : { congregationId: { in: [...ids] } };

/** `BIGINT` vira `number` só se couber sem perder precisão; senão falha alto em vez de somar errado. */
function toSafeNumber(value: bigint): number {
  const converted = Number(value);
  if (!Number.isSafeInteger(converted)) {
    throw new Error('Valor em centavos fora do intervalo seguro.');
  }
  return converted;
}

/**
 * Contas sobre PostgreSQL. Cumpre o mesmo contrato do fake em memória. TODA consulta leva `organization_id` (ADR 0003).
 * O nome único por congregação é um índice no banco (sem diferenciar caixa nem espaços); o travamento otimista é um
 * `UPDATE ... WHERE version = ?`.
 */
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    organizationId: OrganizationId,
    id: AccountId,
  ): Promise<FinancialAccount | null> {
    const row = await this.prisma.financialAccount.findFirst({
      where: { id, organizationId },
    });
    return row ? toAccount(row) : null;
  }

  async add(account: FinancialAccount): Promise<void> {
    try {
      await this.prisma.financialAccount.create({
        data: {
          id: account.id,
          organizationId: account.organizationId,
          congregationId: account.congregationId,
          name: account.name,
          kind: account.kind,
          status: account.status,
          version: account.version,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AccountNameTakenError();
      throw error;
    }
  }

  async save(account: FinancialAccount): Promise<void> {
    let count: number;
    try {
      ({ count } = await this.prisma.financialAccount.updateMany({
        where: {
          id: account.id,
          organizationId: account.organizationId,
          version: account.version,
        },
        data: {
          name: account.name,
          status: account.status,
          version: { increment: 1 },
        },
      }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new AccountNameTakenError();
      throw error;
    }

    if (count === 0) {
      const exists = await this.prisma.financialAccount.findFirst({
        where: { id: account.id, organizationId: account.organizationId },
        select: { id: true },
      });
      if (!exists) throw new AccountNotFoundError();
      throw new ConcurrencyConflictError();
    }
  }

  async list(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      includeArchived: boolean;
    },
  ): Promise<FinancialAccount[]> {
    const rows = await this.prisma.financialAccount.findMany({
      where: {
        organizationId,
        ...inScope(criteria.congregationIds),
        ...(criteria.includeArchived ? {} : { status: 'ACTIVE' as const }),
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAccount);
  }
}

function toAccount(row: AccountRow): FinancialAccount {
  return FinancialAccount.restore({
    id: AccountId.of(row.id),
    organizationId: OrganizationId.of(row.organizationId),
    congregationId: CongregationId.of(row.congregationId),
    name: row.name,
    kind: row.kind,
    status: row.status,
    version: row.version,
  });
}

/** Categorias sobre PostgreSQL (nome único por igreja e sentido, também por índice). */
export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    organizationId: OrganizationId,
    id: CategoryId,
  ): Promise<FinanceCategory | null> {
    const row = await this.prisma.financeCategory.findFirst({
      where: { id, organizationId },
    });
    return row ? toCategory(row) : null;
  }

  async add(category: FinanceCategory): Promise<void> {
    try {
      await this.prisma.financeCategory.create({
        data: {
          id: category.id,
          organizationId: category.organizationId,
          name: category.name,
          direction: category.direction,
          status: category.status,
          version: category.version,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new CategoryNameTakenError();
      throw error;
    }
  }

  async save(category: FinanceCategory): Promise<void> {
    let count: number;
    try {
      ({ count } = await this.prisma.financeCategory.updateMany({
        where: {
          id: category.id,
          organizationId: category.organizationId,
          version: category.version,
        },
        data: {
          name: category.name,
          status: category.status,
          version: { increment: 1 },
        },
      }));
    } catch (error) {
      if (isUniqueViolation(error)) throw new CategoryNameTakenError();
      throw error;
    }

    if (count === 0) {
      const exists = await this.prisma.financeCategory.findFirst({
        where: { id: category.id, organizationId: category.organizationId },
        select: { id: true },
      });
      if (!exists) throw new CategoryNotFoundError();
      throw new ConcurrencyConflictError();
    }
  }

  async list(
    organizationId: OrganizationId,
    criteria: { includeArchived: boolean },
  ): Promise<FinanceCategory[]> {
    const rows = await this.prisma.financeCategory.findMany({
      where: {
        organizationId,
        ...(criteria.includeArchived ? {} : { status: 'ACTIVE' as const }),
      },
      // Entradas antes de saídas (a ordem do enum no banco), depois por nome.
      orderBy: [{ direction: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toCategory);
  }
}

function toCategory(row: CategoryRow): FinanceCategory {
  return FinanceCategory.restore({
    id: CategoryId.of(row.id),
    organizationId: OrganizationId.of(row.organizationId),
    name: row.name,
    direction: row.direction,
    status: row.status,
    version: row.version,
  });
}

/**
 * Livro-razão sobre PostgreSQL. O banco impõe o que o domínio promete (gatilho de imutabilidade, quem pede não decide,
 * um estorno por lançamento): este repositório só os usa e traduz seus erros. Ao CONFIRMAR uma saída, a decisão roda
 * numa transação que TRAVA as linhas das contas (`FOR UPDATE`, em ordem de id) e confere o saldo, então duas aprovações
 * simultâneas não passam juntas do saldo (ADR 0015, item 5).
 */
export class PrismaEntryRepository implements EntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    organizationId: OrganizationId,
    id: EntryId,
  ): Promise<LedgerEntry | null> {
    const row = await this.prisma.financialEntry.findFirst({
      where: { id, organizationId },
    });
    return row ? toEntry(row) : null;
  }

  async findByTransferId(
    organizationId: OrganizationId,
    transferId: TransferId,
  ): Promise<LedgerEntry[]> {
    const rows = await this.prisma.financialEntry.findMany({
      where: { organizationId, transferId },
      orderBy: { id: 'asc' },
    });
    return rows.map(toEntry);
  }

  async add(entries: readonly LedgerEntry[]): Promise<void> {
    try {
      // Um único INSERT: tudo ou nada, inclusive as duas pernas de um repasse.
      await this.prisma.financialEntry.createMany({
        data: entries.map(toCreateData),
      });
    } catch (error) {
      // O único índice único que um lançamento novo pode ferir é o do estorno (o id vem de um UUID novo).
      if (
        isUniqueViolation(error) &&
        entries.some((e) => e.reversesEntryId !== null)
      ) {
        throw new AlreadyReversedError();
      }
      throw error;
    }
  }

  async decide(entries: readonly LedgerEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const organizationId = entries[0]?.organizationId as OrganizationId;

    await this.prisma.$transaction(async (tx) => {
      // Trava as contas envolvidas ANTES de decidir, sempre na mesma ordem (id): sem espera circular entre aprovações.
      const accountIds = [...new Set(entries.map((e) => e.accountId))].sort();
      await tx.$queryRaw`
        SELECT id FROM financial_account
        WHERE organization_id = ${organizationId}::uuid
          AND id = ANY(${accountIds}::uuid[])
        ORDER BY id
        FOR UPDATE`;

      for (const entry of entries) {
        // `status = PENDING` na condição: se outra pessoa decidiu primeiro, nada é atualizado.
        const updated = await tx.financialEntry.updateMany({
          where: {
            id: entry.id,
            organizationId: entry.organizationId,
            status: 'PENDING',
          },
          data: {
            status: entry.status,
            decidedBy: entry.decidedBy,
            decidedAt: entry.decidedAt,
            decisionNote: entry.decisionNote,
          },
        });
        if (updated.count === 0) {
          const exists = await tx.financialEntry.findFirst({
            where: { id: entry.id, organizationId: entry.organizationId },
            select: { id: true },
          });
          throw exists ? new EntryNotPendingError() : new EntryNotFoundError();
        }
      }

      // Saldo das contas que perderam dinheiro, já com a decisão aplicada e as linhas travadas.
      const spending = [
        ...new Set(
          entries
            .filter((e) => e.isConfirmed && e.direction === 'OUT')
            .map((e) => e.accountId),
        ),
      ];
      for (const accountId of spending) {
        const [row] = await tx.$queryRaw<{ balance: bigint }[]>`
          SELECT COALESCE(SUM(CASE WHEN direction = 'IN' THEN amount_cents ELSE -amount_cents END), 0)::bigint AS balance
          FROM financial_entry
          WHERE organization_id = ${organizationId}::uuid
            AND account_id = ${accountId}::uuid
            AND status = 'CONFIRMED'`;
        if ((row?.balance ?? 0n) < 0n) throw new InsufficientBalanceError();
      }
    });
  }

  async search(
    organizationId: OrganizationId,
    criteria: EntrySearchCriteria,
  ): Promise<EntryPage> {
    const where: Prisma.FinancialEntryWhereInput = {
      organizationId,
      ...inScope(criteria.congregationIds),
      ...(criteria.accountId ? { accountId: criteria.accountId } : {}),
      ...(criteria.status ? { status: criteria.status } : {}),
      ...(criteria.categoryId ? { categoryId: criteria.categoryId } : {}),
      ...dateRange(criteria.from, criteria.to),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.financialEntry.findMany({
        where,
        orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
        skip: criteria.offset,
        take: criteria.limit,
      }),
      this.prisma.financialEntry.count({ where }),
    ]);
    return { items: rows.map(toEntry), total };
  }

  async aggregate(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      from: CalendarDate | null;
      to: CalendarDate | null;
    },
  ): Promise<AggregateRow[]> {
    const groups = await this.prisma.financialEntry.groupBy({
      by: ['congregationId', 'accountId', 'categoryId', 'kind', 'direction'],
      where: {
        organizationId,
        status: 'CONFIRMED',
        ...inScope(criteria.congregationIds),
        ...dateRange(criteria.from, criteria.to),
      },
      _sum: { amountCents: true },
      _count: { _all: true },
    });
    return groups.map((group) => ({
      congregationId: CongregationId.of(group.congregationId),
      accountId: AccountId.of(group.accountId),
      categoryId: group.categoryId ? CategoryId.of(group.categoryId) : null,
      kind: group.kind,
      direction: group.direction,
      totalCents: toSafeNumber(group._sum.amountCents ?? 0n),
      count: group._count._all,
    }));
  }

  countPending(
    organizationId: OrganizationId,
    congregationIds: readonly CongregationId[] | null,
  ): Promise<number> {
    return this.prisma.financialEntry.count({
      where: { organizationId, status: 'PENDING', ...inScope(congregationIds) },
    });
  }

  async listByMember(
    organizationId: OrganizationId,
    memberId: MemberRef,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      since: CalendarDate | null;
    },
  ): Promise<LedgerEntry[]> {
    const rows = await this.prisma.financialEntry.findMany({
      where: {
        organizationId,
        memberId,
        status: 'CONFIRMED',
        ...inScope(criteria.congregationIds),
        ...dateRange(criteria.since, null),
      },
      orderBy: [{ occurredOn: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toEntry);
  }
}

function dateRange(from: CalendarDate | null, to: CalendarDate | null) {
  if (from === null && to === null) return {};
  return {
    occurredOn: {
      ...(from ? { gte: from.toDate() } : {}),
      ...(to ? { lte: to.toDate() } : {}),
    },
  };
}

function toCreateData(
  entry: LedgerEntry,
): Prisma.FinancialEntryCreateManyInput {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    congregationId: entry.congregationId,
    accountId: entry.accountId,
    kind: entry.kind,
    direction: entry.direction,
    amountCents: BigInt(entry.amount.cents),
    occurredOn: entry.occurredOn.toDate(),
    description: entry.description,
    categoryId: entry.categoryId,
    memberId: entry.memberId,
    transferId: entry.transferId,
    reversesEntryId: entry.reversesEntryId,
    status: entry.status,
    requestedBy: entry.requestedBy,
    requestedAt: entry.requestedAt,
    decidedBy: entry.decidedBy,
    decidedAt: entry.decidedAt,
    decisionNote: entry.decisionNote,
  };
}

function toEntry(row: EntryRow): LedgerEntry {
  return LedgerEntry.restore({
    id: EntryId.of(row.id),
    organizationId: OrganizationId.of(row.organizationId),
    congregationId: CongregationId.of(row.congregationId),
    accountId: AccountId.of(row.accountId),
    kind: row.kind,
    direction: row.direction,
    amount: Money.ofCents(toSafeNumber(row.amountCents)),
    occurredOn: CalendarDate.fromStoredDate(row.occurredOn),
    description: row.description,
    categoryId: row.categoryId ? CategoryId.of(row.categoryId) : null,
    memberId: row.memberId ? MemberRef.of(row.memberId) : null,
    transferId: row.transferId ? TransferId.of(row.transferId) : null,
    reversesEntryId: row.reversesEntryId
      ? EntryId.of(row.reversesEntryId)
      : null,
    status: row.status,
    requestedBy: ActorId.of(row.requestedBy),
    requestedAt: row.requestedAt,
    decidedBy: row.decidedBy ? ActorId.of(row.decidedBy) : null,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
  });
}
