import type { AddressPrimitives } from '../../../shared/domain/address.js';
import type { Member } from '../domain/member.js';
import type { MemberHistoryEvent } from '../domain/member-history-event.js';
import type { MemberAccess } from './member-access.js';

/** Visões de leitura (dados simples): a apresentação nunca recebe objetos de domínio. */

export interface HistoryEventView {
  id: string;
  type: MemberHistoryEvent['type'];
  occurredOn: string;
  notes: string | null;
  fromCongregationId: string | null;
  toCongregationId: string | null;
  fromStatus: MemberHistoryEvent['fromStatus'];
  toStatus: MemberHistoryEvent['toStatus'];
  recordedAt: Date;
}

/** Tudo do cadastro. DADO SENSÍVEL: só sai depois de registrada a leitura na trilha de auditoria. */
export interface MemberDetailView {
  id: string;
  fullName: string;
  congregationId: string;
  status: Member['status'];
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: AddressPrimitives | null;
  anonymized: boolean;
  /** O que ESTE usuário pode fazer com este membro (a interface mostra ou esconde os botões a partir daqui). */
  capabilities: { canEdit: boolean; canAnonymize: boolean };
  history: HistoryEventView[];
}

export function toHistoryEventView(
  event: MemberHistoryEvent,
): HistoryEventView {
  return {
    id: event.id,
    type: event.type,
    occurredOn: event.occurredOn.value,
    notes: event.notes,
    fromCongregationId: event.fromCongregationId,
    toCongregationId: event.toCongregationId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    recordedAt: event.recordedAt,
  };
}

export function toMemberDetailView(
  member: Member,
  history: readonly MemberHistoryEvent[],
  access: MemberAccess,
): MemberDetailView {
  return {
    id: member.id,
    fullName: member.fullName.value,
    congregationId: member.congregationId,
    status: member.status,
    birthDate: member.birthDate?.value ?? null,
    phone: member.phone?.value ?? null,
    email: member.email?.value ?? null,
    address: member.address?.toPrimitives() ?? null,
    anonymized: member.isAnonymized,
    capabilities: {
      canEdit: !member.isAnonymized && access.canWrite(member.congregationId),
      canAnonymize: !member.isAnonymized && access.canAnonymize(),
    },
    history: history.map(toHistoryEventView),
  };
}
