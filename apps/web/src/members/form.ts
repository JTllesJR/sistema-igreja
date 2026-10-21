import type {
  MemberDetail,
  MemberHistoryEvent,
  MemberStatus,
  RegisterMemberRequest,
} from '@igreja/contracts';
import {
  emptyAddress,
  hasAddress,
  toAddressRequest,
  type AddressForm,
  type FieldErrors,
} from '../congregations/form';

/**
 * Lógica dos telas de membros, sem React (testável sem tela). Os campos do formulário são sempre texto; `toRequest`
 * converte para o contrato da API. DADOS SENSÍVEIS: nada daqui vai para `localStorage`, URL ou log.
 */

export const STATUS_LABELS: Readonly<Record<MemberStatus, string>> = {
  ACTIVE: 'Ativo',
  AWAY: 'Afastado',
  TRANSFERRED_OUT: 'Transferido para outra igreja',
  DECEASED: 'Falecido',
};
export const STATUSES = Object.keys(STATUS_LABELS) as MemberStatus[];

export const EVENT_TYPE_LABELS: Readonly<
  Record<MemberHistoryEvent['type'], string>
> = {
  REGISTERED: 'Cadastrado',
  BAPTISM: 'Batismo',
  RECEPTION: 'Recepção',
  TRANSFER: 'Transferência',
  STATUS_CHANGE: 'Mudança de situação',
  ANONYMIZED: 'Dados anonimizados',
};

export interface MemberForm {
  congregationId: string;
  fullName: string;
  birthDate: string;
  phone: string;
  email: string;
  address: AddressForm;
}

export const emptyMemberForm = (congregationId = ''): MemberForm => ({
  congregationId,
  fullName: '',
  birthDate: '',
  phone: '',
  email: '',
  address: emptyAddress(),
});

export function fromMember(member: MemberDetail): MemberForm {
  return {
    congregationId: member.congregationId,
    fullName: member.fullName,
    birthDate: member.birthDate ?? '',
    phone: member.phone ?? '',
    email: member.email ?? '',
    address: member.address
      ? {
          street: member.address.street,
          number: member.address.number ?? '',
          complement: member.address.complement ?? '',
          district: member.address.district ?? '',
          city: member.address.city,
          state: member.address.state,
          postalCode: member.address.postalCode ?? '',
        }
      : emptyAddress(),
  };
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Validação rápida, só para dar retorno antes de enviar. A API repete todas as regras (e tem mais). */
export function validateMemberForm(
  form: MemberForm,
  options: { requireCongregation: boolean },
): FieldErrors {
  const errors: FieldErrors = {};

  if (options.requireCongregation && form.congregationId === '') {
    errors['congregationId'] = 'Escolha a congregação.';
  }
  if (form.fullName.trim().length < 2) {
    errors['fullName'] = 'Informe o nome completo.';
  }
  if (form.birthDate !== '' && !isoDate.test(form.birthDate)) {
    errors['birthDate'] = 'Informe a data de nascimento.';
  }
  const digits = form.phone.replace(/\D/g, '');
  if (form.phone.trim() !== '' && (digits.length < 10 || digits.length > 13)) {
    errors['phone'] = 'Informe o telefone com DDD (ex.: (81) 99999-8888).';
  }
  if (
    form.email.trim() !== '' &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  ) {
    errors['email'] = 'Informe um e-mail válido.';
  }
  if (hasAddress(form.address)) {
    if (form.address.street.trim() === '')
      errors['address.street'] = 'Informe a rua.';
    if (form.address.city.trim() === '')
      errors['address.city'] = 'Informe a cidade.';
    if (form.address.state.trim() === '')
      errors['address.state'] = 'Escolha o estado.';
  }
  return errors;
}

const orNull = (value: string): string | null =>
  value.trim() === '' ? null : value.trim();

/** Corpo do cadastro. Campo opcional vazio vira `null`. */
export function toCreateRequest(form: MemberForm): RegisterMemberRequest {
  return {
    congregationId: form.congregationId,
    fullName: form.fullName.trim(),
    birthDate: orNull(form.birthDate),
    phone: orNull(form.phone),
    email: orNull(form.email),
    address: toAddressRequest(form.address),
  };
}

/** Corpo da edição: tudo que o formulário mostra, com vazio = apagar. A congregação NÃO muda por aqui (é a transferência). */
export function toUpdateRequest(form: MemberForm) {
  return {
    fullName: form.fullName.trim(),
    birthDate: orNull(form.birthDate),
    phone: orNull(form.phone),
    email: orNull(form.email),
    address: toAddressRequest(form.address),
  };
}

/** "1990-05-10" -> "10/05/1990". Não passa por `Date`: um dia não escorrega por causa do fuso. */
export function formatDate(iso: string | null): string {
  if (iso === null) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** "81999998888" -> "(81) 99999-8888"; "8133334444" -> "(81) 3333-4444". Outros formatos ficam como estão. */
export function formatPhone(digits: string | null): string {
  if (digits === null) return '—';
  const match = /^(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : digits;
}

/** Uma linha da história em português, usando os nomes das congregações quando se sabe (senão, só "outra congregação"). */
export function describeEvent(
  event: MemberHistoryEvent,
  congregationName: (id: string | null) => string,
): string {
  switch (event.type) {
    case 'TRANSFER':
      return `Transferência de ${congregationName(event.fromCongregationId)} para ${congregationName(event.toCongregationId)}`;
    case 'STATUS_CHANGE':
      return `Situação: ${event.fromStatus ? STATUS_LABELS[event.fromStatus] : '—'} → ${event.toStatus ? STATUS_LABELS[event.toStatus] : '—'}`;
    case 'REGISTERED':
      return `Cadastrado em ${congregationName(event.toCongregationId)}`;
    default:
      return EVENT_TYPE_LABELS[event.type];
  }
}

/** O texto que a pessoa precisa digitar para confirmar a anonimização (irreversível). */
export const ANONYMIZE_CONFIRMATION = 'ANONIMIZAR';

export const isAnonymizeConfirmed = (typed: string): boolean =>
  typed.trim() === ANONYMIZE_CONFIRMATION;
