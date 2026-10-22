import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import {
  AccountNotFoundError,
  EntryNotFoundError,
  FinanceAccessDeniedError,
  MemberUnavailableError,
  TransferRequiresHeadquartersError,
  TransferSameCongregationError,
} from '../domain/errors.js';
import type {
  AccountRepository,
  CategoryRepository,
  EntryRepository,
} from '../domain/finance.repositories.js';
import { AccountId, EntryId, TransferId } from '../domain/ids.js';
import { LedgerEntry, MemberRef } from '../domain/ledger-entry.js';
import { Money } from '../domain/money.js';
import type { CongregationDirectory, MemberDirectory } from './directories.js';
import type { FinanceAccess } from './finance-access.js';
import {
  assertCanReceiveEntries,
  loadUsableCategory,
  loadWritableAccount,
} from './finance-guards.js';

interface EntryFields {
  accountId: string;
  amountCents: number;
  occurredOn: string;
  description?: string | null;
}

/** Valor e data de um lançamento, validados antes de qualquer consulta ao banco. */
function amountAndDate(command: { amountCents: number; occurredOn: string }): {
  amount: Money;
  occurredOn: CalendarDate;
} {
  return {
    amount: Money.ofCents(command.amountCents),
    occurredOn: CalendarDate.parse(command.occurredOn, 'occurredOn'),
  };
}

export interface RecordIncomeCommand extends EntryFields {
  categoryId: string;
  /** Quem contribuiu. Ausente = anônimo. Exige `finance:read-individual` na congregação (dado sensível). */
  memberId?: string | null;
}

/** UC-12: registra uma entrada (dízimo, oferta...). Vale na hora: entrada não precisa de aprovação. */
export class RecordIncomeUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly entries: EntryRepository,
    private readonly congregations: CongregationDirectory,
    private readonly members: MemberDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: RecordIncomeCommand,
  ): Promise<{ id: string }> {
    const { amount, occurredOn } = amountAndDate(command);
    const memberId = command.memberId ? MemberRef.of(command.memberId) : null;

    const account = await loadWritableAccount(
      this.accounts,
      context,
      access,
      command.accountId,
    );
    // Ligar um membro revela quem ele é para quem lança: só com a permissão de ver contribuição individual.
    if (memberId && !access.canReadIndividual(account.congregationId)) {
      throw new FinanceAccessDeniedError();
    }
    await assertCanReceiveEntries(this.congregations, context, account);
    const category = await loadUsableCategory(
      this.categories,
      context,
      command.categoryId,
      'IN',
    );
    if (
      memberId &&
      !(await this.members.find(context.organizationId, memberId))
    ) {
      throw new MemberUnavailableError();
    }

    const entry = LedgerEntry.recordIncome({
      id: EntryId.of(this.ids.next()),
      organizationId: context.organizationId,
      congregationId: account.congregationId,
      accountId: account.id,
      categoryId: category.id,
      memberId,
      amount,
      occurredOn,
      description: command.description,
      requestedBy: context.actorId,
      now: this.clock.now(),
    });
    await this.entries.add([entry]);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.income_recorded',
      entity: 'financial_entry',
      entityId: entry.id,
      metadata: {
        congregationId: entry.congregationId,
        amountCents: amount.cents,
        identified: memberId !== null,
      },
    });
    return { id: entry.id };
  }
}

export interface RequestExpenseCommand extends EntryFields {
  categoryId: string;
}

/** UC-13: pede uma saída. Ela NASCE PENDENTE: só vira dinheiro quando outra pessoa da sede aprovar (ADR 0015). */
export class RequestExpenseUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository,
    private readonly entries: EntryRepository,
    private readonly congregations: CongregationDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: RequestExpenseCommand,
  ): Promise<{ id: string }> {
    const { amount, occurredOn } = amountAndDate(command);
    const account = await loadWritableAccount(
      this.accounts,
      context,
      access,
      command.accountId,
    );
    await assertCanReceiveEntries(this.congregations, context, account);
    const category = await loadUsableCategory(
      this.categories,
      context,
      command.categoryId,
      'OUT',
    );

    const entry = LedgerEntry.requestExpense({
      id: EntryId.of(this.ids.next()),
      organizationId: context.organizationId,
      congregationId: account.congregationId,
      accountId: account.id,
      categoryId: category.id,
      amount,
      occurredOn,
      description: command.description,
      requestedBy: context.actorId,
      now: this.clock.now(),
    });
    await this.entries.add([entry]);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.expense_requested',
      entity: 'financial_entry',
      entityId: entry.id,
      metadata: {
        congregationId: entry.congregationId,
        amountCents: amount.cents,
      },
    });
    return { id: entry.id };
  }
}

/**
 * Pede o saldo inicial de uma conta (o sistema começa do zero, sem importar planilhas). Como cria saldo sem dinheiro de
 * verdade, também espera a aprovação da sede.
 */
export class RequestOpeningBalanceUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly entries: EntryRepository,
    private readonly congregations: CongregationDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: EntryFields,
  ): Promise<{ id: string }> {
    const { amount, occurredOn } = amountAndDate(command);
    const account = await loadWritableAccount(
      this.accounts,
      context,
      access,
      command.accountId,
    );
    await assertCanReceiveEntries(this.congregations, context, account);

    const entry = LedgerEntry.requestOpeningBalance({
      id: EntryId.of(this.ids.next()),
      organizationId: context.organizationId,
      congregationId: account.congregationId,
      accountId: account.id,
      amount,
      occurredOn,
      description: command.description,
      requestedBy: context.actorId,
      now: this.clock.now(),
    });
    await this.entries.add([entry]);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.opening_balance_requested',
      entity: 'financial_entry',
      entityId: entry.id,
      metadata: {
        congregationId: entry.congregationId,
        amountCents: amount.cents,
      },
    });
    return { id: entry.id };
  }
}

export interface RequestTransferCommand {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  occurredOn: string;
  description?: string | null;
}

/**
 * Repasse entre a sede e uma congregação (em qualquer sentido): duas pernas pendentes ligadas, que a sede decide juntas.
 * Exige escrita na congregação de ORIGEM; a conta de destino só precisa existir e estar ativa (quem repassa não precisa
 * enxergar o financeiro do destino).
 */
export class RequestTransferUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly entries: EntryRepository,
    private readonly congregations: CongregationDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: RequestTransferCommand,
  ): Promise<{ transferId: string }> {
    const { amount, occurredOn } = amountAndDate(command);
    const from = await loadWritableAccount(
      this.accounts,
      context,
      access,
      command.fromAccountId,
    );
    const to = await this.accounts.findById(
      context.organizationId,
      AccountId.of(command.toAccountId),
    );
    if (!to) throw new AccountNotFoundError();
    if (from.congregationId === to.congregationId) {
      throw new TransferSameCongregationError();
    }

    const headquarters = await this.congregations.headquartersOf(
      context.organizationId,
    );
    if (
      headquarters === null ||
      (from.congregationId !== headquarters &&
        to.congregationId !== headquarters)
    ) {
      throw new TransferRequiresHeadquartersError();
    }
    await assertCanReceiveEntries(this.congregations, context, from);
    await assertCanReceiveEntries(this.congregations, context, to);

    const transferId = TransferId.of(this.ids.next());
    const { out, in: incoming } = LedgerEntry.requestTransfer({
      transferId,
      organizationId: context.organizationId,
      from: {
        id: EntryId.of(this.ids.next()),
        congregationId: from.congregationId,
        accountId: from.id,
      },
      to: {
        id: EntryId.of(this.ids.next()),
        congregationId: to.congregationId,
        accountId: to.id,
      },
      amount,
      occurredOn,
      description: command.description,
      requestedBy: context.actorId,
      now: this.clock.now(),
    });
    await this.entries.add([out, incoming]);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.transfer_requested',
      entity: 'transfer',
      entityId: transferId,
      metadata: {
        fromCongregationId: from.congregationId,
        toCongregationId: to.congregationId,
        amountCents: amount.cents,
      },
    });
    return { transferId };
  }
}

export interface RequestReversalCommand {
  entryId: string;
  /** Por que estornar. Obrigatório: um estorno sem explicação é o que a auditoria menos aceita. */
  reason: string;
  /** Dia do estorno. Padrão: hoje. */
  occurredOn?: string;
}

/**
 * UC-14: pede o estorno de um lançamento confirmado. Não apaga nada: cria um lançamento de sentido oposto, ligado ao
 * original (uma vez só), que espera a sede como qualquer saída.
 */
export class RequestReversalUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: RequestReversalCommand,
  ): Promise<{ id: string }> {
    if (command.reason.trim() === '') {
      throw new ValidationError('reason', 'Informe o motivo do estorno.');
    }
    const now = this.clock.now();
    const occurredOn = command.occurredOn
      ? CalendarDate.parse(command.occurredOn, 'occurredOn')
      : CalendarDate.fromInstant(now);

    const original = await this.entries.findById(
      context.organizationId,
      EntryId.of(command.entryId),
    );
    if (!original || !access.canRead(original.congregationId)) {
      throw new EntryNotFoundError();
    }
    if (!access.canWrite(original.congregationId)) {
      throw new FinanceAccessDeniedError();
    }

    const reversal = LedgerEntry.requestReversal(original, {
      id: EntryId.of(this.ids.next()),
      occurredOn,
      reason: command.reason,
      requestedBy: context.actorId,
      now,
    });
    await this.entries.add([reversal]);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.reversal_requested',
      entity: 'financial_entry',
      entityId: reversal.id,
      metadata: {
        reverses: original.id,
        congregationId: reversal.congregationId,
        amountCents: reversal.amount.cents,
      },
    });
    return { id: reversal.id };
  }
}
