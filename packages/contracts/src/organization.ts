import { z } from 'zod';

/**
 * Contratos do módulo `organization` (igreja e congregações; ADR 0009 e 0011).
 *
 * Os limites de tamanho aqui só barram entrada absurda (e deixam a web validar cedo); as regras de verdade (UF
 * existente, nome único, horário sem conflito etc.) vivem no domínio da API, que responde 422 com a mensagem.
 */

const text = (max: number) => z.string().max(max);

export const addressSchema = z.object({
  street: text(200),
  number: text(20).nullish(),
  complement: text(100).nullish(),
  district: text(100).nullish(),
  city: text(100),
  state: text(2),
  postalCode: text(9).nullish(),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;
export const weekdaySchema = z.enum(WEEKDAYS);

export const serviceTimeSchema = z.object({
  weekday: weekdaySchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:mm.'),
  name: text(100),
});
export type ServiceTimeInput = z.infer<typeof serviceTimeSchema>;

// Evita corpo enorme com centenas de horários; nenhuma congregação real chega perto disso.
const serviceTimesSchema = z.array(serviceTimeSchema).max(30);

export const renameOrganizationRequestSchema = z.object({ name: text(200) });
export type RenameOrganizationRequest = z.infer<
  typeof renameOrganizationRequestSchema
>;

export const registerCongregationRequestSchema = z.object({
  name: text(200),
  address: addressSchema.nullish(),
  serviceTimes: serviceTimesSchema.optional(),
});
export type RegisterCongregationRequest = z.infer<
  typeof registerCongregationRequestSchema
>;

/** Campo ausente = manter; `address: null` = remover o endereço. */
export const updateCongregationRequestSchema = z.object({
  name: text(200).optional(),
  address: addressSchema.nullable().optional(),
  serviceTimes: serviceTimesSchema.optional(),
});
export type UpdateCongregationRequest = z.infer<
  typeof updateCongregationRequestSchema
>;

export const congregationStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export type CongregationStatus = z.infer<typeof congregationStatusSchema>;

export const listCongregationsQuerySchema = z.object({
  status: congregationStatusSchema.optional(),
});
export type ListCongregationsQuery = z.infer<
  typeof listCongregationsQuerySchema
>;

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const congregationSchema = z.object({
  id: z.string(),
  name: z.string(),
  isHeadquarters: z.boolean(),
  status: congregationStatusSchema,
  address: z
    .object({
      street: z.string(),
      number: z.string().nullable(),
      complement: z.string().nullable(),
      district: z.string().nullable(),
      city: z.string(),
      state: z.string(),
      postalCode: z.string().nullable(),
    })
    .nullable(),
  serviceTimes: z.array(
    z.object({ weekday: weekdaySchema, time: z.string(), name: z.string() }),
  ),
});
export type Congregation = z.infer<typeof congregationSchema>;
