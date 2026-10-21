import { Address } from '../address.js';
import { CongregationName } from '../congregation-name.js';
import { CongregationId, OrganizationId } from '../ids.js';
import { ServiceTime } from '../service-time.js';

/** UUIDs determinísticos e legíveis nos testes: o número identifica a entidade. */
const uuid = (n: number): string =>
  `0199c0a4-7b3e-7c11-8f2a-${String(n).padStart(12, '0')}`;

export const orgId = (n = 1): OrganizationId => OrganizationId.of(uuid(n));
export const congId = (n: number): CongregationId =>
  CongregationId.of(uuid(1000 + n));

export const name = (raw: string): CongregationName =>
  CongregationName.create(raw);

export const sundayEvening = (): ServiceTime =>
  ServiceTime.create({
    weekday: 'SUNDAY',
    time: '19:00',
    name: 'Culto de celebração',
  });

export const wednesdayEvening = (): ServiceTime =>
  ServiceTime.create({
    weekday: 'WEDNESDAY',
    time: '19:30',
    name: 'Culto de oração',
  });

export const anAddress = (): Address =>
  Address.create({ street: 'Rua das Flores', city: 'Campinas', state: 'SP' });
