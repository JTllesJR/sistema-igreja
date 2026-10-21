import { ValidationError } from '../../../shared/domain/domain-error.js';
import type { Address } from '../../../shared/domain/address.js';
import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import { optionalText } from '../../../shared/domain/text.js';
import { CalendarDate } from './calendar-date.js';
import type { ContactEmail } from './contact-email.js';
import {
  MemberAlreadyInCongregationError,
  MemberAlreadyInStatusError,
  MemberAnonymizedError,
} from './errors.js';
import type { MemberEventId, MemberId } from './ids.js';
import type {
  ManualEventType,
  MemberHistoryEvent,
} from './member-history-event.js';
import type { MemberStatus } from './member-status.js';
import { PersonName } from './person-name.js';
import type { Phone } from './phone.js';

const NOTES_MAX_LENGTH = 500;

export interface MemberProps {
  id: MemberId;
  organizationId: OrganizationId;
  congregationId: CongregationId;
  fullName: PersonName;
  birthDate: CalendarDate | null;
  phone: Phone | null;
  email: ContactEmail | null;
  address: Address | null;
  status: MemberStatus;
  anonymizedAt: Date | null;
  version: number;
}

/** Campos editáveis do cadastro. Ausente (`undefined`) = manter; `null` = apagar (exceto o nome, que é obrigatório). */
export interface ProfileChanges {
  fullName?: PersonName;
  birthDate?: CalendarDate | null;
  phone?: Phone | null;
  email?: ContactEmail | null;
  address?: Address | null;
}

interface Equatable<T> {
  equals(other: T): boolean;
}

/** Igualdade de valores opcionais: dois ausentes são iguais; um ausente e um presente, não. */
function same<T extends Equatable<T>>(a: T | null, b: T | null): boolean {
  return a === null || b === null ? a === b : a.equals(b);
}

/**
 * Membro de uma congregação. Agregado: toda mudança passa por aqui, e cada mudança que importa para a história gera um
 * evento (`pendingEvents`), que o repositório grava junto com o membro, na mesma transação.
 *
 * DADO SENSÍVEL (ADR 0006). Não é excluído: o pedido do titular vira `anonymize()`, que apaga os dados pessoais e mantém
 * a linha (para os números e o histórico continuarem fechando).
 *
 * O domínio nunca lê o relógio: quem chama passa `now`.
 */
export class Member {
  #props: MemberProps;
  readonly #pendingEvents: MemberHistoryEvent[];

  private constructor(props: MemberProps, pending: MemberHistoryEvent[] = []) {
    this.#props = props;
    this.#pendingEvents = pending;
  }

  /** Cadastra um membro novo e já registra o evento `REGISTERED` na história. */
  static register(input: {
    id: MemberId;
    organizationId: OrganizationId;
    congregationId: CongregationId;
    fullName: PersonName;
    birthDate?: CalendarDate | null;
    phone?: Phone | null;
    email?: ContactEmail | null;
    address?: Address | null;
    status?: MemberStatus;
    eventId: MemberEventId;
    now: Date;
  }): Member {
    const today = CalendarDate.fromInstant(input.now);
    const birthDate = input.birthDate ?? null;
    if (birthDate?.isAfter(today)) {
      throw new ValidationError(
        'birthDate',
        'A data de nascimento não pode estar no futuro.',
      );
    }

    const member = new Member({
      id: input.id,
      organizationId: input.organizationId,
      congregationId: input.congregationId,
      fullName: input.fullName,
      birthDate,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      status: input.status ?? 'ACTIVE',
      anonymizedAt: null,
      version: 0,
    });
    member.#record({
      id: input.eventId,
      type: 'REGISTERED',
      occurredOn: today,
      notes: null,
      toCongregationId: input.congregationId,
      now: input.now,
    });
    return member;
  }

  /** Reconstrói um membro gravado, sem eventos pendentes. */
  static restore(props: MemberProps): Member {
    return new Member({ ...props });
  }

  get id(): MemberId {
    return this.#props.id;
  }
  get organizationId(): OrganizationId {
    return this.#props.organizationId;
  }
  get congregationId(): CongregationId {
    return this.#props.congregationId;
  }
  get fullName(): PersonName {
    return this.#props.fullName;
  }
  get birthDate(): CalendarDate | null {
    return this.#props.birthDate;
  }
  get phone(): Phone | null {
    return this.#props.phone;
  }
  get email(): ContactEmail | null {
    return this.#props.email;
  }
  get address(): Address | null {
    return this.#props.address;
  }
  get status(): MemberStatus {
    return this.#props.status;
  }
  get anonymizedAt(): Date | null {
    return this.#props.anonymizedAt;
  }
  get isAnonymized(): boolean {
    return this.#props.anonymizedAt !== null;
  }
  get version(): number {
    return this.#props.version;
  }

  /** Eventos gerados desde que o membro foi carregado e que ainda não foram gravados. Cópia. */
  get pendingEvents(): readonly MemberHistoryEvent[] {
    return [...this.#pendingEvents];
  }

  /**
   * Altera os dados do cadastro. Devolve os NOMES dos campos que de fato mudaram (para a auditoria registrar quais
   * campos, nunca os valores); lista vazia = nada mudou e nada precisa ser gravado.
   */
  updateProfile(changes: ProfileChanges, now: Date): string[] {
    this.#assertNotAnonymized();

    if (changes.birthDate?.isAfter(CalendarDate.fromInstant(now))) {
      throw new ValidationError(
        'birthDate',
        'A data de nascimento não pode estar no futuro.',
      );
    }

    const next: MemberProps = { ...this.#props };
    const changed: string[] = [];

    if (
      changes.fullName !== undefined &&
      !changes.fullName.equals(next.fullName)
    ) {
      next.fullName = changes.fullName;
      changed.push('fullName');
    }
    if (
      changes.birthDate !== undefined &&
      !same(changes.birthDate, next.birthDate)
    ) {
      next.birthDate = changes.birthDate;
      changed.push('birthDate');
    }
    if (changes.phone !== undefined && !same(changes.phone, next.phone)) {
      next.phone = changes.phone;
      changed.push('phone');
    }
    if (changes.email !== undefined && !same(changes.email, next.email)) {
      next.email = changes.email;
      changed.push('email');
    }
    if (changes.address !== undefined && !same(changes.address, next.address)) {
      next.address = changes.address;
      changed.push('address');
    }

    this.#props = next;
    return changed;
  }

  changeStatus(status: MemberStatus, eventId: MemberEventId, now: Date): void {
    this.#assertNotAnonymized();
    if (status === this.#props.status)
      throw new MemberAlreadyInStatusError(status);

    const from = this.#props.status;
    this.#props = { ...this.#props, status };
    this.#record({
      id: eventId,
      type: 'STATUS_CHANGE',
      occurredOn: CalendarDate.fromInstant(now),
      notes: null,
      fromStatus: from,
      toStatus: status,
      now,
    });
  }

  /** Passa o membro para outra congregação e deixa o rastro (de onde, para onde) na história. */
  transferTo(
    destination: CongregationId,
    eventId: MemberEventId,
    now: Date,
  ): void {
    this.#assertNotAnonymized();
    if (destination === this.#props.congregationId) {
      throw new MemberAlreadyInCongregationError();
    }

    const from = this.#props.congregationId;
    this.#props = { ...this.#props, congregationId: destination };
    this.#record({
      id: eventId,
      type: 'TRANSFER',
      occurredOn: CalendarDate.fromInstant(now),
      notes: null,
      fromCongregationId: from,
      toCongregationId: destination,
      now,
    });
  }

  /** Registra um fato informado por quem cadastra (batismo, recepção), com a data em que ocorreu. */
  recordEvent(input: {
    type: ManualEventType;
    occurredOn: CalendarDate;
    notes?: string | null;
    eventId: MemberEventId;
    now: Date;
  }): void {
    this.#assertNotAnonymized();
    if (input.occurredOn.isAfter(CalendarDate.fromInstant(input.now))) {
      throw new ValidationError(
        'occurredOn',
        'A data do fato não pode estar no futuro.',
      );
    }

    const notes = optionalText(input.notes);
    if (notes !== null && notes.length > NOTES_MAX_LENGTH) {
      throw new ValidationError(
        'notes',
        `A observação deve ter no máximo ${NOTES_MAX_LENGTH} caracteres.`,
      );
    }
    this.#record({
      id: input.eventId,
      type: input.type,
      occurredOn: input.occurredOn,
      notes,
      now: input.now,
    });
  }

  /**
   * Apaga os dados pessoais (pedido do titular, LGPD, ADR 0006). IRREVERSÍVEL. Mantém a linha, a congregação, a situação
   * e a história (sem as observações, que o repositório limpa), para as contas da igreja continuarem fechando.
   */
  anonymize(eventId: MemberEventId, now: Date): void {
    this.#assertNotAnonymized();

    this.#props = {
      ...this.#props,
      fullName: PersonName.anonymized(),
      birthDate: null,
      phone: null,
      email: null,
      address: null,
      anonymizedAt: now,
    };
    this.#record({
      id: eventId,
      type: 'ANONYMIZED',
      occurredOn: CalendarDate.fromInstant(now),
      notes: null,
      now,
    });
  }

  #assertNotAnonymized(): void {
    if (this.isAnonymized) throw new MemberAnonymizedError();
  }

  #record(input: {
    id: MemberEventId;
    type: MemberHistoryEvent['type'];
    occurredOn: CalendarDate;
    notes: string | null;
    fromCongregationId?: CongregationId;
    toCongregationId?: CongregationId;
    fromStatus?: MemberStatus;
    toStatus?: MemberStatus;
    now: Date;
  }): void {
    this.#pendingEvents.push({
      id: input.id,
      type: input.type,
      occurredOn: input.occurredOn,
      notes: input.notes,
      fromCongregationId: input.fromCongregationId ?? null,
      toCongregationId: input.toCongregationId ?? null,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      recordedAt: input.now,
    });
  }
}
