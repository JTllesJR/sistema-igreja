import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import type { LedgerEntry, MemberRef } from '../domain/ledger-entry.js';
import type { MemberDirectory } from './directories.js';
import type { FinanceAccess } from './finance-access.js';
import { type EntryView, toEntryView } from './views.js';

/**
 * Transforma lançamentos em visões, escondendo QUEM contribuiu de quem não tem `finance:read-individual` na congregação
 * do lançamento (ADR 0015, item 7). Quando a identidade é revelada, é leitura de dado sensível: a trilha é registrada
 * ANTES de devolver e, se falhar, nada sai (falha fechada, ADR 0013). A trilha leva só a contagem, nunca nomes.
 */
export async function presentEntries(
  entries: readonly LedgerEntry[],
  context: RequestContext,
  access: FinanceAccess,
  members: MemberDirectory,
  audit: AuditLog,
): Promise<EntryView[]> {
  const revealed = entries.filter(
    (entry) =>
      entry.memberId !== null && access.canReadIndividual(entry.congregationId),
  );

  const names = new Map<MemberRef, string>();
  if (revealed.length > 0) {
    const ids = [...new Set(revealed.map((e) => e.memberId as MemberRef))];
    for (const member of await members.findMany(context.organizationId, ids)) {
      names.set(member.id, member.fullName);
    }
    await audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.contributors_viewed',
      entity: 'financial_entry',
      entityId: null,
      metadata: { entries: revealed.length },
    });
  }

  const revealedIds = new Set(revealed.map((entry) => entry.id));
  return entries.map((entry) =>
    toEntryView(
      entry,
      revealedIds.has(entry.id) && entry.memberId !== null
        ? { id: entry.memberId, name: names.get(entry.memberId) ?? null }
        : null,
    ),
  );
}
