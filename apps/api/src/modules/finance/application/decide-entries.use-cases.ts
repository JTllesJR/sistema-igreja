import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import {
  ApprovalNotAllowedError,
  EntryNotFoundError,
  FinanceAccessDeniedError,
} from '../domain/errors.js';
import type { EntryRepository } from '../domain/finance.repositories.js';
import { EntryId } from '../domain/ids.js';
import type { LedgerEntry } from '../domain/ledger-entry.js';
import type { CongregationDirectory } from './directories.js';
import type { FinanceAccess } from './finance-access.js';

/**
 * O pedido a decidir e, se for um repasse, as DUAS pernas: a sede decide o par junto (ADR 0015, item 6). Só quem
 * alcança a sede decide; essa checagem vem ANTES de procurar o pedido, então um não-aprovador não aprende nada sobre ele.
 */
async function loadDecidableGroup(
  entries: EntryRepository,
  congregations: CongregationDirectory,
  context: RequestContext,
  access: FinanceAccess,
  rawEntryId: string,
): Promise<LedgerEntry[]> {
  const headquarters = await congregations.headquartersOf(
    context.organizationId,
  );
  if (headquarters === null || !access.canApprove(headquarters)) {
    throw new ApprovalNotAllowedError();
  }
  const entry = await entries.findById(
    context.organizationId,
    EntryId.of(rawEntryId),
  );
  if (!entry) throw new EntryNotFoundError();
  return entry.transferId === null
    ? [entry]
    : entries.findByTransferId(context.organizationId, entry.transferId);
}

async function recordDecision(
  audit: AuditLog,
  context: RequestContext,
  action: string,
  decided: readonly LedgerEntry[],
): Promise<void> {
  for (const entry of decided) {
    await audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action,
      entity: 'financial_entry',
      entityId: entry.id,
      metadata: {
        congregationId: entry.congregationId,
        amountCents: entry.amount.cents,
        direction: entry.direction,
        kind: entry.kind,
      },
    });
  }
}

export interface ApproveEntryCommand {
  entryId: string;
}

/**
 * UC-13: a sede APROVA um pedido pendente. Outra pessoa que não quem pediu (separação de funções, também imposta pelo
 * banco). Ao confirmar uma saída o saldo é conferido com a conta travada: nunca fica negativo.
 */
export class ApproveEntryUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly congregations: CongregationDirectory,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: ApproveEntryCommand,
  ): Promise<void> {
    const group = await loadDecidableGroup(
      this.entries,
      this.congregations,
      context,
      access,
      command.entryId,
    );
    const now = this.clock.now();
    const decided = group.map((entry) => entry.approve(context.actorId, now));

    await this.entries.decide(decided);
    await recordDecision(
      this.audit,
      context,
      'finance.entry_approved',
      decided,
    );
  }
}

export interface RejectEntryCommand {
  entryId: string;
  /** Motivo da recusa (obrigatório). */
  note: string;
}

/** A sede RECUSA um pedido pendente, com motivo. Recusar não olha o saldo. */
export class RejectEntryUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly congregations: CongregationDirectory,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: RejectEntryCommand,
  ): Promise<void> {
    const group = await loadDecidableGroup(
      this.entries,
      this.congregations,
      context,
      access,
      command.entryId,
    );
    const now = this.clock.now();
    const decided = group.map((entry) =>
      entry.reject(context.actorId, command.note, now),
    );

    await this.entries.decide(decided);
    await recordDecision(
      this.audit,
      context,
      'finance.entry_rejected',
      decided,
    );
  }
}

export interface CancelEntryCommand {
  entryId: string;
}

/**
 * Desiste de um pedido pendente. Pode quem fez o pedido ou quem tem escrita na congregação dele (na de ORIGEM, se for
 * repasse). Cancelar não é decisão da sede, então não registra decisor. Para quem não pode, o pedido é "não
 * encontrado" se nem lê aquela congregação.
 */
export class CancelEntryUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: CancelEntryCommand,
  ): Promise<void> {
    const entry = await this.entries.findById(
      context.organizationId,
      EntryId.of(command.entryId),
    );
    if (!entry) throw new EntryNotFoundError();

    const group =
      entry.transferId === null
        ? [entry]
        : await this.entries.findByTransferId(
            context.organizationId,
            entry.transferId,
          );
    // Num repasse, quem responde é a congregação que ENVIA o dinheiro.
    const owner = group.find((e) => e.direction === 'OUT') ?? entry;
    const isRequester = group.some((e) => e.requestedBy === context.actorId);
    if (!isRequester && !access.canRead(owner.congregationId)) {
      throw new EntryNotFoundError();
    }
    if (!isRequester && !access.canWrite(owner.congregationId)) {
      throw new FinanceAccessDeniedError();
    }

    const now = this.clock.now();
    const cancelled = group.map((e) => e.cancel(now));
    await this.entries.decide(cancelled);
    await recordDecision(
      this.audit,
      context,
      'finance.entry_cancelled',
      cancelled,
    );
  }
}
