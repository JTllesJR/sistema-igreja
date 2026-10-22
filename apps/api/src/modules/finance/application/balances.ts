import type { AggregateRow } from '../domain/finance.repositories.js';

/** Efeito de uma linha agregada (só confirmados) no saldo: entrada soma, saída subtrai. */
export function signedTotal(row: AggregateRow): number {
  return row.direction === 'IN' ? row.totalCents : -row.totalCents;
}

/** Saldo por conta, a partir de TODAS as linhas confirmadas da conta (ADR 0005: o saldo é calculado, não guardado). */
export function balancesByAccount(
  rows: readonly AggregateRow[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const row of rows) {
    balances.set(
      row.accountId,
      (balances.get(row.accountId) ?? 0) + signedTotal(row),
    );
  }
  return balances;
}
