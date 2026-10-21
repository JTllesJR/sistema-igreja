import type {
  Congregation,
  CurrentUser,
  RegisterCongregationRequest,
} from '@igreja/contracts';
import type { ApiError } from '../auth/http';
import { hasPermission } from '../auth/permissions';

/**
 * Lógica do formulário de congregação, sem React: assim é testada sem tela. Os campos do formulário são sempre texto
 * (é o que um `<input>` entrega); `toRequest` converte para o contrato da API.
 */

export type Weekday = Congregation['serviceTimes'][number]['weekday'];

export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  SUNDAY: 'Domingo',
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado',
};

// Ordem de exibição: a semana começa no domingo, como o culto principal.
export const WEEKDAYS = Object.keys(WEEKDAY_LABELS) as Weekday[];

export const UFS = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export interface AddressForm {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface ServiceTimeForm {
  weekday: Weekday;
  time: string;
  name: string;
}

export interface CongregationForm {
  name: string;
  address: AddressForm;
  serviceTimes: ServiceTimeForm[];
}

/** Erros por campo, com a mesma chave que a API usa em `errors[].path` (ex.: `serviceTimes.0.time`). */
export type FieldErrors = Record<string, string>;

export const emptyAddress = (): AddressForm => ({
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  postalCode: '',
});

export const newServiceTime = (): ServiceTimeForm => ({
  weekday: 'SUNDAY',
  time: '',
  name: '',
});

export const emptyForm = (): CongregationForm => ({
  name: '',
  address: emptyAddress(),
  serviceTimes: [],
});

export function fromCongregation(congregation: Congregation): CongregationForm {
  return {
    name: congregation.name,
    address: congregation.address
      ? {
          street: congregation.address.street,
          number: congregation.address.number ?? '',
          complement: congregation.address.complement ?? '',
          district: congregation.address.district ?? '',
          city: congregation.address.city,
          state: congregation.address.state,
          postalCode: congregation.address.postalCode ?? '',
        }
      : emptyAddress(),
    serviceTimes: congregation.serviceTimes.map((s) => ({ ...s })),
  };
}

/** Endereço é opcional, mas se qualquer campo foi preenchido, vale como endereço (e então rua, cidade e UF são exigidas). */
export function hasAddress(address: AddressForm): boolean {
  return Object.values(address).some((value) => value.trim() !== '');
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validação rápida, só para dar retorno antes de enviar. A API repete todas as regras (e tem mais: nome único etc.). */
export function validateForm(form: CongregationForm): FieldErrors {
  const errors: FieldErrors = {};

  if (form.name.trim() === '')
    errors['name'] = 'Informe o nome da congregação.';

  if (hasAddress(form.address)) {
    if (form.address.street.trim() === '')
      errors['address.street'] = 'Informe a rua.';
    if (form.address.city.trim() === '')
      errors['address.city'] = 'Informe a cidade.';
    if (form.address.state.trim() === '')
      errors['address.state'] = 'Escolha o estado.';
  }

  form.serviceTimes.forEach((service, index) => {
    if (!TIME.test(service.time)) {
      errors[`serviceTimes.${index}.time`] = 'Informe o horário (ex.: 19:00).';
    }
    if (service.name.trim() === '') {
      errors[`serviceTimes.${index}.name`] = 'Dê um nome ao culto.';
    }
  });

  return errors;
}

const orNull = (value: string): string | null =>
  value.trim() === '' ? null : value.trim();

/** O endereço do formulário no formato da API; sem nenhum campo preenchido, `null` (na edição, isso remove). */
export function toAddressRequest(
  address: AddressForm,
): RegisterCongregationRequest['address'] {
  return hasAddress(address)
    ? {
        street: address.street.trim(),
        number: orNull(address.number),
        complement: orNull(address.complement),
        district: orNull(address.district),
        city: address.city.trim(),
        state: address.state.trim().toUpperCase(),
        postalCode: orNull(address.postalCode),
      }
    : null;
}

/** Converte o formulário (texto) no corpo da API. Sem endereço preenchido, envia `null` (remove, na edição). */
export function toRequest(form: CongregationForm): RegisterCongregationRequest {
  return {
    name: form.name.trim(),
    address: toAddressRequest(form.address),
    serviceTimes: form.serviceTimes.map((s) => ({
      weekday: s.weekday,
      time: s.time,
      name: s.name.trim(),
    })),
  };
}

/** "Rua das Flores, 100 · Centro · Recife/PE" */
export function summarizeAddress(address: Congregation['address']): string {
  if (!address) return 'Endereço não informado';
  const street = address.number
    ? `${address.street}, ${address.number}`
    : address.street;
  const parts = [street, address.district, `${address.city}/${address.state}`];
  return parts.filter((part): part is string => !!part).join(' · ');
}

/** "Domingo às 19:00 · Culto de celebração" */
export function describeServiceTime(
  service: Congregation['serviceTimes'][number],
): string {
  return `${WEEKDAY_LABELS[service.weekday]} às ${service.time} · ${service.name}`;
}

/**
 * O que mostrar quando a API recusa o envio: uma mensagem geral e os erros por campo. Entrada malformada (400) traz
 * os campos; regra de negócio (409, 422) traz só a mensagem, já em português.
 */
export function describeApiError(error: ApiError): {
  summary: string;
  fields: FieldErrors;
} {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    fields[issue.path] ??= issue.message;
  }
  return {
    summary:
      error.issues.length > 0
        ? 'Corrija os campos destacados e tente de novo.'
        : error.message,
    fields,
  };
}

/**
 * A pessoa tem a permissão (`modulo:acao`) para a IGREJA TODA? O curinga `*` do Administrador cobre qualquer uma.
 * Serve só para MOSTRAR ou esconder botões: quem decide é a API, que responde 403 a quem não pode.
 */
export function canManageOrganization(user: CurrentUser): boolean {
  return hasPermission(user, 'organization:manage');
}
