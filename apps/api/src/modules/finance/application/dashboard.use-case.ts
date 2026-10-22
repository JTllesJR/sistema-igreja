import type { Clock } from '../../../shared/application/clock.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { FinanceAccessDeniedError } from '../domain/errors.js';
import type { EntryDirection } from '../domain/finance-category.js';
import type {
  AggregateRow,
  EntryRepository,
} from '../domain/finance.repositories.js';
import { balancesByAccount } from './balances.js';
import type { FinanceAccess } from './finance-access.js';

export interface DashboardQuery {
  /** Início do período. Padrão: primeiro dia do mês atual. */
  from?: string | null;
  /** Fim do período (inclusive). Padrão: hoje. */
  to?: string | null;
  /** Só uma congregação. Ausente = tudo o que o usuário pode ver (a visão consolidada, UC-16, para quem vê a igreja toda). */
  congregationId?: string | null;
}

interface CategoryTotal {
  categoryId: string;
  direction: EntryDirection;
  totalCents: number;
}

interface CongregationTotal {
  congregationId: string;
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
}

export interface DashboardView {
  period: { from: string; to: string };
  /** `ORGANIZATION` = consolidado da igreja toda; `CONGREGATIONS` = só o que o escopo do usuário alcança. */
  scope: 'ORGANIZATION' | 'CONGREGATIONS';
  totals: {
    incomeCents: number;
    expenseCents: number;
    resultCents: number;
    /** Repasses: não são receita nem despesa e, somados na igreja toda, se anulam. */
    transferInCents: number;
    transferOutCents: number;
    openingBalanceCents: number;
  };
  byCategory: CategoryTotal[];
  byCongregation: CongregationTotal[];
  /** Saldo (confirmado, de sempre) de cada conta com movimento. */
  accountBalances: { accountId: string; balanceCents: number }[];
  totalBalanceCents: number;
  pendingApprovals: number;
}

/**
 * UC-15 e UC-16: painel financeiro. Duas consultas agregadas no banco (o período e o saldo de sempre) que a aplicação
 * dobra aqui. O estorno herda a categoria do original e tem sentido oposto, então desconta da categoria de origem.
 */
export class GetDashboardUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    query: DashboardQuery,
  ): Promise<DashboardView> {
    const today = CalendarDate.fromInstant(this.clock.now());
    const from = query.from
      ? CalendarDate.parse(query.from, 'from')
      : CalendarDate.parse(`${today.value.slice(0, 8)}01`, 'from');
    const to = query.to ? CalendarDate.parse(query.to, 'to') : today;
    if (from.isAfter(to)) {
      throw new ValidationError('from', 'O início vem depois do fim.');
    }

    const readable = access.readableCongregations();
    let congregationIds = readable === null ? null : [...readable];
    if (query.congregationId) {
      const wanted = CongregationId.of(query.congregationId);
      if (readable !== null && !readable.includes(wanted)) {
        throw new FinanceAccessDeniedError();
      }
      congregationIds = [wanted];
    }

    const [periodRows, allTimeRows, pendingApprovals] = await Promise.all([
      this.entries.aggregate(context.organizationId, {
        congregationIds,
        from,
        to,
      }),
      this.entries.aggregate(context.organizationId, {
        congregationIds,
        from: null,
        to: null,
      }),
      this.entries.countPending(context.organizationId, congregationIds),
    ]);

    const balances = balancesByAccount(allTimeRows);
    const byCongregation = new Map<string, CongregationTotal>();
    const congregationOf = (id: string): CongregationTotal => {
      const found = byCongregation.get(id) ?? {
        congregationId: id,
        incomeCents: 0,
        expenseCents: 0,
        balanceCents: 0,
      };
      byCongregation.set(id, found);
      return found;
    };
    for (const row of allTimeRows) {
      congregationOf(row.congregationId).balanceCents +=
        row.direction === 'IN' ? row.totalCents : -row.totalCents;
    }

    const totals = {
      incomeCents: 0,
      expenseCents: 0,
      resultCents: 0,
      transferInCents: 0,
      transferOutCents: 0,
      openingBalanceCents: 0,
    };
    const categories = new Map<string, CategoryTotal>();
    for (const row of periodRows) {
      const effect = classify(row);
      if (effect.bucket === 'opening') {
        totals.openingBalanceCents += row.totalCents;
      } else if (effect.bucket === 'transfer') {
        if (row.direction === 'IN') totals.transferInCents += row.totalCents;
        else totals.transferOutCents += row.totalCents;
      } else {
        const sign = effect.sign * row.totalCents;
        const target = congregationOf(row.congregationId);
        if (effect.bucket === 'income') {
          totals.incomeCents += sign;
          target.incomeCents += sign;
        } else {
          totals.expenseCents += sign;
          target.expenseCents += sign;
        }
        if (row.categoryId !== null) {
          const key = `${effect.bucket}|${row.categoryId}`;
          const entry = categories.get(key) ?? {
            categoryId: row.categoryId,
            direction: effect.bucket === 'income' ? 'IN' : 'OUT',
            totalCents: 0,
          };
          entry.totalCents += sign;
          categories.set(key, entry);
        }
      }
    }
    totals.resultCents = totals.incomeCents - totals.expenseCents;

    return {
      period: { from: from.value, to: to.value },
      scope: congregationIds === null ? 'ORGANIZATION' : 'CONGREGATIONS',
      totals,
      byCategory: [...categories.values()].sort(
        (a, b) =>
          a.direction.localeCompare(b.direction) || b.totalCents - a.totalCents,
      ),
      byCongregation: [...byCongregation.values()].sort((a, b) =>
        a.congregationId.localeCompare(b.congregationId),
      ),
      accountBalances: [...balances.entries()].map(
        ([accountId, balanceCents]) => ({ accountId, balanceCents }),
      ),
      totalBalanceCents: [...balances.values()].reduce((a, b) => a + b, 0),
      pendingApprovals,
    };
  }
}

/**
 * Em qual coluna do painel a linha cai, e com que sinal. Entrada comum é receita; saída comum, despesa. O estorno de uma
 * entrada (sentido OUT) DESCONTA da receita; o de uma saída (sentido IN) desconta da despesa.
 */
function classify(
  row: AggregateRow,
):
  | { bucket: 'opening' }
  | { bucket: 'transfer' }
  | { bucket: 'income'; sign: 1 | -1 }
  | { bucket: 'expense'; sign: 1 | -1 } {
  switch (row.kind) {
    case 'OPENING_BALANCE':
      return { bucket: 'opening' };
    case 'TRANSFER':
      return { bucket: 'transfer' };
    case 'ORDINARY':
      return row.direction === 'IN'
        ? { bucket: 'income', sign: 1 }
        : { bucket: 'expense', sign: 1 };
    case 'REVERSAL':
      return row.direction === 'OUT'
        ? { bucket: 'income', sign: -1 }
        : { bucket: 'expense', sign: -1 };
  }
}
