import { z } from 'zod';
import { Address } from '../../../shared/domain/address.js';
import { OrganizationStateCorruptedError } from '../domain/errors.js';
import { ServiceTime } from '../domain/service-time.js';

// O banco devolve JSON como `unknown`. Primeiro conferimos o FORMATO (Zod); depois os value objects
// conferem o CONTEÚDO (UF existente, horário HH:mm...). Dado fora do esperado é acusado como corrupção.

const addressShape = z.object({
  street: z.string(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  district: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().nullable(),
});

const serviceTimesShape = z.array(
  z.object({ weekday: z.string(), time: z.string(), name: z.string() }),
);

export function readAddress(json: unknown): Address | null {
  if (json === null) return null;
  const parsed = addressShape.safeParse(json);
  if (!parsed.success) {
    throw new OrganizationStateCorruptedError(
      'endereço gravado em formato inválido.',
    );
  }
  return Address.fromPrimitives(parsed.data);
}

export function readServiceTimes(json: unknown): ServiceTime[] {
  const parsed = serviceTimesShape.safeParse(json);
  if (!parsed.success) {
    throw new OrganizationStateCorruptedError(
      'horários de culto gravados em formato inválido.',
    );
  }
  return parsed.data.map((item) => ServiceTime.create(item));
}
