import { Address } from '../../../../shared/domain/address.js';
import {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { CalendarDate } from '../calendar-date.js';
import { ContactEmail } from '../contact-email.js';
import { MemberEventId, MemberId } from '../ids.js';
import { Member } from '../member.js';
import { PersonName } from '../person-name.js';
import { Phone } from '../phone.js';

export const orgId = (n = 1): OrganizationId => OrganizationId.of(uuidFor(n));
export const congId = (n: number): CongregationId =>
  CongregationId.of(uuidFor(1000 + n));
export const memberId = (n = 1): MemberId => MemberId.of(uuidFor(2000 + n));
export const eventId = (n = 1): MemberEventId =>
  MemberEventId.of(uuidFor(3000 + n));

/** Instante fixo dos testes; o domínio nunca lê o relógio, recebe `now`. */
export const NOW = new Date('2026-10-20T12:00:00.000Z');
export const MINUTE = 60_000;
export const after = (from: Date, ms: number): Date =>
  new Date(from.getTime() + ms);

export const date = (raw: string): CalendarDate =>
  CalendarDate.parse(raw, 'date');

export const anAddress = (): Address =>
  Address.create({
    street: 'Rua das Flores',
    number: '100',
    city: 'Recife',
    state: 'PE',
  });

/**
 * Um membro recém-cadastrado (com o evento REGISTERED pendente). `organization` e `congregation` escolhem em que
 * igreja e congregação ele nasce (as do seed do banco: igreja 1 tem as congregações 1 a 3; igreja 2, a 10).
 */
export function aMember(
  n = 1,
  options: {
    organization?: number;
    congregation?: number;
    name?: string;
    full?: boolean;
  } = {},
): Member {
  const { organization = 1, congregation = 1, name, full = false } = options;
  return Member.register({
    id: memberId(n),
    organizationId: orgId(organization),
    congregationId: congId(congregation),
    fullName: PersonName.create(name ?? `Maria da Silva ${n}`),
    ...(full
      ? {
          birthDate: date('1990-05-10'),
          phone: Phone.create('(81) 99999-8888'),
          email: ContactEmail.create('Maria@Exemplo.com'),
          address: anAddress(),
        }
      : {}),
    eventId: eventId(n),
    now: NOW,
  });
}
