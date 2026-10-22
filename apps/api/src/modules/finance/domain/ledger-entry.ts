import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import type {
  ActorId,
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import type { Brand } from '../../../shared/domain/brand.js';
import { parseIdentifier } from '../../../shared/domain/identifiers.js';
import {
  EntryNotPendingError,
  NotReversibleError,
  SelfApprovalError,
  TransferSameCongregationError,
} from './errors.js';
import type { EntryDirection } from './finance-category.js';
import type { AccountId, CategoryId, EntryId, TransferId } from './ids.js';
import type { Money } from './money.js';
import { optionalNote } from './text.js';

/** Quem contribuiu. É só uma referência: a ficha do membro pertence ao módulo `members` (ADR 0001). */
export type MemberRef = Brand<string, 'MemberRef'>;
export const MemberRef = {
  of: (value: string): MemberRef => parseIdentifier<'MemberRef'>(value),
};

/**
 * - `ORDINARY`: entrada ou saída comum (tem categoria).
 * - `OPENING_BALANCE`: saldo inicial de uma conta (o sistema começa do zero, sem importação).
 * - `TRANSFER`: uma das duas pernas de um repasse entre congregações.
 * - `REVERSAL`: estorno de outro lançamento.
 */
export type EntryKind =
  'ORDINARY' | 'OPENING_BALANCE' | 'TRANSFER' | 'REVERSAL';

/**
 * - `CONFIRMED`: vale (entra no saldo).
 * - `PENDING`: pedido aguardando a sede; ainda NÃO é dinheiro.
 * - `REJECTED` e `CANCELLED`: não valem.
 */
export type EntryStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

const DESCRIPTION_MAX = 200;
const NOTE_MAX = 300;

export interface LedgerEntryProps {
  id: EntryId;
  organizationId: OrganizationId;
  congregationId: CongregationId;
  accountId: AccountId;
  kind: EntryKind;
  direction: EntryDirection;
  amount: Money;
  /** O dia do fato; pode ser anterior ao registro, nunca futuro. */
  occurredOn: CalendarDate;
  description: string | null;
  categoryId: CategoryId | null;
  memberId: MemberRef | null;
  transferId: TransferId | null;
  reversesEntryId: EntryId | null;
  status: EntryStatus;
  requestedBy: ActorId;
  requestedAt: Date;
  decidedBy: ActorId | null;
  decidedAt: Date | null;
  decisionNote: string | null;
}

interface Common {
  id: EntryId;
  organizationId: OrganizationId;
  congregationId: CongregationId;
  accountId: AccountId;
  amount: Money;
  occurredOn: CalendarDate;
  description?: string | null;
  requestedBy: ActorId;
  now: Date;
}

/**
 * Um lançamento financeiro (ADR 0005 e 0015). Depois de DECIDIDO ele nunca mais muda: a correção é um estorno, que é outro
 * lançamento. O que diminui o saldo (saída, perna de saída do repasse, estorno de entrada) e o saldo inicial nascem
 * PENDENTES e só valem quando OUTRA pessoa da sede os aprova; a entrada comum nasce confirmada.
 *
 * O domínio nunca lê o relógio: quem chama passa `now`.
 */
export class LedgerEntry {
  readonly #props: LedgerEntryProps;

  private constructor(props: LedgerEntryProps) {
    this.#props = props;
  }

  /** Entrada comum (dízimo, oferta...): vale na hora. `memberId` nulo = anônima. */
  static recordIncome(
    input: Common & { categoryId: CategoryId; memberId?: MemberRef | null },
  ): LedgerEntry {
    return LedgerEntry.create(input, {
      kind: 'ORDINARY',
      direction: 'IN',
      status: 'CONFIRMED',
      categoryId: input.categoryId,
      memberId: input.memberId ?? null,
    });
  }

  /** Pedido de saída: só vale quando a sede aprovar. */
  static requestExpense(
    input: Common & { categoryId: CategoryId },
  ): LedgerEntry {
    return LedgerEntry.create(input, {
      kind: 'ORDINARY',
      direction: 'OUT',
      status: 'PENDING',
      categoryId: input.categoryId,
    });
  }

  /** Saldo inicial de uma conta: cria saldo sem dinheiro de verdade, então também espera a sede. */
  static requestOpeningBalance(input: Common): LedgerEntry {
    return LedgerEntry.create(input, {
      kind: 'OPENING_BALANCE',
      direction: 'IN',
      status: 'PENDING',
    });
  }

  /**
   * Repasse entre duas congregações: duas pernas ligadas (sai de uma conta, entra na outra), ambas pendentes. A sede as
   * decide JUNTAS.
   */
  static requestTransfer(input: {
    transferId: TransferId;
    organizationId: OrganizationId;
    from: { id: EntryId; congregationId: CongregationId; accountId: AccountId };
    to: { id: EntryId; congregationId: CongregationId; accountId: AccountId };
    amount: Money;
    occurredOn: CalendarDate;
    description?: string | null;
    requestedBy: ActorId;
    now: Date;
  }): { out: LedgerEntry; in: LedgerEntry } {
    if (input.from.congregationId === input.to.congregationId) {
      throw new TransferSameCongregationError();
    }
    const common = {
      organizationId: input.organizationId,
      amount: input.amount,
      occurredOn: input.occurredOn,
      description: input.description,
      requestedBy: input.requestedBy,
      now: input.now,
    };
    const base = {
      kind: 'TRANSFER' as const,
      status: 'PENDING' as const,
      transferId: input.transferId,
    };
    return {
      out: LedgerEntry.create(
        { ...common, ...input.from },
        { ...base, direction: 'OUT' },
      ),
      in: LedgerEntry.create(
        { ...common, ...input.to },
        { ...base, direction: 'IN' },
      ),
    };
  }

  /**
   * Estorno: lançamento de sentido OPOSTO, mesma conta, valor, categoria e membro do original, ligado a ele. É pendente
   * (estornar uma entrada é tirar dinheiro do caixa). Só se estorna lançamento confirmado, comum ou saldo inicial.
   */
  static requestReversal(
    original: LedgerEntry,
    input: {
      id: EntryId;
      occurredOn: CalendarDate;
      reason?: string | null;
      requestedBy: ActorId;
      now: Date;
    },
  ): LedgerEntry {
    const reversible =
      original.status === 'CONFIRMED' &&
      (original.kind === 'ORDINARY' || original.kind === 'OPENING_BALANCE');
    if (!reversible) throw new NotReversibleError();
    if (input.occurredOn.value < original.occurredOn.value) {
      throw new ValidationError(
        'occurredOn',
        'O estorno não pode ser anterior ao lançamento estornado.',
      );
    }

    return LedgerEntry.create(
      {
        id: input.id,
        organizationId: original.organizationId,
        congregationId: original.congregationId,
        accountId: original.accountId,
        amount: original.amount,
        occurredOn: input.occurredOn,
        description: input.reason,
        requestedBy: input.requestedBy,
        now: input.now,
      },
      {
        kind: 'REVERSAL',
        direction: original.direction === 'IN' ? 'OUT' : 'IN',
        status: 'PENDING',
        categoryId: original.categoryId,
        memberId: original.memberId,
        reversesEntryId: original.id,
      },
    );
  }

  static restore(props: LedgerEntryProps): LedgerEntry {
    return new LedgerEntry({ ...props });
  }

  private static create(
    common: Common,
    shape: {
      kind: EntryKind;
      direction: EntryDirection;
      status: EntryStatus;
      categoryId?: CategoryId | null;
      memberId?: MemberRef | null;
      transferId?: TransferId;
      reversesEntryId?: EntryId;
    },
  ): LedgerEntry {
    if (common.occurredOn.isAfter(CalendarDate.fromInstant(common.now))) {
      throw new ValidationError(
        'occurredOn',
        'A data do lançamento não pode estar no futuro.',
      );
    }
    return new LedgerEntry({
      id: common.id,
      organizationId: common.organizationId,
      congregationId: common.congregationId,
      accountId: common.accountId,
      kind: shape.kind,
      direction: shape.direction,
      amount: common.amount,
      occurredOn: common.occurredOn,
      description: optionalNote(
        common.description,
        DESCRIPTION_MAX,
        'description',
      ),
      categoryId: shape.categoryId ?? null,
      memberId: shape.memberId ?? null,
      transferId: shape.transferId ?? null,
      reversesEntryId: shape.reversesEntryId ?? null,
      status: shape.status,
      requestedBy: common.requestedBy,
      requestedAt: common.now,
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
    });
  }

  get id(): EntryId {
    return this.#props.id;
  }
  get organizationId(): OrganizationId {
    return this.#props.organizationId;
  }
  get congregationId(): CongregationId {
    return this.#props.congregationId;
  }
  get accountId(): AccountId {
    return this.#props.accountId;
  }
  get kind(): EntryKind {
    return this.#props.kind;
  }
  get direction(): EntryDirection {
    return this.#props.direction;
  }
  get amount(): Money {
    return this.#props.amount;
  }
  get occurredOn(): CalendarDate {
    return this.#props.occurredOn;
  }
  get description(): string | null {
    return this.#props.description;
  }
  get categoryId(): CategoryId | null {
    return this.#props.categoryId;
  }
  get memberId(): MemberRef | null {
    return this.#props.memberId;
  }
  get transferId(): TransferId | null {
    return this.#props.transferId;
  }
  get reversesEntryId(): EntryId | null {
    return this.#props.reversesEntryId;
  }
  get status(): EntryStatus {
    return this.#props.status;
  }
  get requestedBy(): ActorId {
    return this.#props.requestedBy;
  }
  get requestedAt(): Date {
    return this.#props.requestedAt;
  }
  get decidedBy(): ActorId | null {
    return this.#props.decidedBy;
  }
  get decidedAt(): Date | null {
    return this.#props.decidedAt;
  }
  get decisionNote(): string | null {
    return this.#props.decisionNote;
  }

  get isPending(): boolean {
    return this.#props.status === 'PENDING';
  }
  get isConfirmed(): boolean {
    return this.#props.status === 'CONFIRMED';
  }

  /** O efeito no saldo se for confirmado: entrada soma, saída subtrai. */
  get signedCents(): number {
    return this.#props.direction === 'IN'
      ? this.#props.amount.cents
      : -this.#props.amount.cents;
  }

  /** A sede aprova. Outra pessoa que não quem pediu; o pedido precisa estar pendente. Devolve o lançamento confirmado. */
  approve(by: ActorId, now: Date): LedgerEntry {
    this.#assertCanBeDecidedBy(by);
    return new LedgerEntry({
      ...this.#props,
      status: 'CONFIRMED',
      decidedBy: by,
      decidedAt: now,
    });
  }

  /** A sede recusa, com motivo obrigatório. */
  reject(by: ActorId, note: string, now: Date): LedgerEntry {
    this.#assertCanBeDecidedBy(by);
    const reason = optionalNote(note, NOTE_MAX, 'decisionNote');
    if (reason === null) {
      throw new ValidationError('decisionNote', 'Informe o motivo da recusa.');
    }
    return new LedgerEntry({
      ...this.#props,
      status: 'REJECTED',
      decidedBy: by,
      decidedAt: now,
      decisionNote: reason,
    });
  }

  /**
   * Quem pediu (ou quem tem escrita na congregação) desiste do pedido pendente. Não é uma decisão da sede, então não
   * registra decisor: o banco exige que quem decide seja diferente de quem pediu.
   */
  cancel(now: Date): LedgerEntry {
    if (!this.isPending) throw new EntryNotPendingError();
    return new LedgerEntry({
      ...this.#props,
      status: 'CANCELLED',
      decidedAt: now,
    });
  }

  #assertCanBeDecidedBy(by: ActorId): void {
    if (!this.isPending) throw new EntryNotPendingError();
    if (by === this.#props.requestedBy) throw new SelfApprovalError();
  }
}
