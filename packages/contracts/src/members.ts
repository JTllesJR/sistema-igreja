import { z } from 'zod';
import { addressSchema } from './organization.js';

/**
 * Contratos do módulo `members` (ADR 0013). DADOS SENSÍVEIS (LGPD, ADR 0006): a lista devolve o mínimo para achar a
 * pessoa (sem contato nem nascimento); a ficha completa é uma leitura auditada.
 *
 * Os limites de tamanho só barram entrada absurda e deixam a web validar cedo; as regras de verdade (nome válido,
 * telefone brasileiro, data real, nascimento fora do futuro) vivem no domínio da API, que responde 422 com a mensagem.
 */

export const MEMBER_STATUSES = [
  'ACTIVE',
  'AWAY',
  'TRANSFERRED_OUT',
  'DECEASED',
] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

export const MANUAL_EVENT_TYPES = ['BAPTISM', 'RECEPTION'] as const;
export const manualEventTypeSchema = z.enum(MANUAL_EVENT_TYPES);
export type ManualEventType = z.infer<typeof manualEventTypeSchema>;

export const memberEventTypeSchema = z.enum([
  ...MANUAL_EVENT_TYPES,
  'REGISTERED',
  'TRANSFER',
  'STATUS_CHANGE',
  'ANONYMIZED',
]);
export type MemberEventType = z.infer<typeof memberEventTypeSchema>;

const text = (max: number) => z.string().max(max);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.');

export const registerMemberRequestSchema = z.object({
  congregationId: z.uuid(),
  fullName: text(300),
  birthDate: isoDate.nullish(),
  phone: text(40).nullish(),
  email: text(300).nullish(),
  address: addressSchema.nullish(),
  status: memberStatusSchema.optional(),
});
export type RegisterMemberRequest = z.infer<typeof registerMemberRequestSchema>;

/** Campo ausente = manter; `null` = apagar (exceto o nome, que é obrigatório). */
export const updateMemberRequestSchema = z.object({
  fullName: text(300).optional(),
  birthDate: isoDate.nullable().optional(),
  phone: text(40).nullable().optional(),
  email: text(300).nullable().optional(),
  address: addressSchema.nullable().optional(),
});
export type UpdateMemberRequest = z.infer<typeof updateMemberRequestSchema>;

export const changeMemberStatusRequestSchema = z.object({
  status: memberStatusSchema,
});
export type ChangeMemberStatusRequest = z.infer<
  typeof changeMemberStatusRequestSchema
>;

export const transferMemberRequestSchema = z.object({
  congregationId: z.uuid(),
});
export type TransferMemberRequest = z.infer<typeof transferMemberRequestSchema>;

export const recordMemberEventRequestSchema = z.object({
  type: manualEventTypeSchema,
  occurredOn: isoDate,
  notes: text(600).nullish(),
});
export type RecordMemberEventRequest = z.infer<
  typeof recordMemberEventRequestSchema
>;

export const MAX_PAGE_SIZE = 100;

/** Parâmetros da URL chegam como texto: os números são convertidos aqui. */
export const listMembersQuerySchema = z.object({
  search: text(200).optional(),
  status: memberStatusSchema.optional(),
  congregationId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

export const memberSummarySchema = z.object({
  id: z.string(),
  fullName: z.string(),
  congregationId: z.string(),
  status: memberStatusSchema,
});
export type MemberSummary = z.infer<typeof memberSummarySchema>;

export const memberListResponseSchema = z.object({
  items: z.array(memberSummarySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type MemberListResponse = z.infer<typeof memberListResponseSchema>;

export const memberHistoryEventSchema = z.object({
  id: z.string(),
  type: memberEventTypeSchema,
  occurredOn: z.string(),
  notes: z.string().nullable(),
  fromCongregationId: z.string().nullable(),
  toCongregationId: z.string().nullable(),
  fromStatus: memberStatusSchema.nullable(),
  toStatus: memberStatusSchema.nullable(),
  recordedAt: z.iso.datetime(),
});
export type MemberHistoryEvent = z.infer<typeof memberHistoryEventSchema>;

export const memberDetailSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  congregationId: z.string(),
  status: memberStatusSchema,
  birthDate: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
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
  anonymized: z.boolean(),
  /** O que quem pediu pode fazer com ESTE membro: a interface mostra ou esconde os botões a partir daqui. */
  capabilities: z.object({ canEdit: z.boolean(), canAnonymize: z.boolean() }),
  history: z.array(memberHistoryEventSchema),
});
export type MemberDetail = z.infer<typeof memberDetailSchema>;

export const memberCreatedSchema = z.object({ id: z.string() });
export type MemberCreated = z.infer<typeof memberCreatedSchema>;
