import { Address, type AddressInput } from '../../../shared/domain/address.js';
import { ServiceTime } from '../domain/service-time.js';

/** Horário de culto como chega de fora (texto); vira `ServiceTime` (validado) dentro do caso de uso. */
export interface ServiceTimeInput {
  weekday: string;
  time: string;
  name: string;
}

/** `undefined` = não informado (manter); `null` = remover; objeto = valor novo. */
export function toAddress(
  input: AddressInput | null | undefined,
): Address | null | undefined {
  if (input === undefined || input === null) return input;
  return Address.create(input);
}

export function toServiceTimes(
  inputs: readonly ServiceTimeInput[] | undefined,
): ServiceTime[] | undefined {
  return inputs?.map((input) => ServiceTime.create(input));
}
