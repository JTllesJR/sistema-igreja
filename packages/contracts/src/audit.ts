import { z } from 'zod';

/**
 * Contratos da consulta à trilha de auditoria (UC-04, ADR 0017). A trilha é somente-anexação e NUNCA guarda dado pessoal
 * (só ids, ações e contexto técnico), mas quem consulta vê quem leu o quê, então a consulta exige `audit:read` para a
 * igreja toda e é, ela mesma, registrada.
 */

export const MAX_AUDIT_PAGE_SIZE = 100;

const isoInstant = z.iso.datetime({
  message: 'Use data e hora UTC no formato AAAA-MM-DDThh:mm:ssZ.',
});

export const listAuditQuerySchema = z.object({
  /** Quem fez. */
  actorId: z.uuid().optional(),
  /** Tipo do dado afetado: `member`, `financial_entry`... */
  entity: z.string().max(60).optional(),
  /** O dado afetado (por exemplo, o id de um membro). */
  entityId: z.uuid().optional(),
  /** Ação exata: `member.viewed`. */
  action: z.string().max(80).optional(),
  /** Todas as ações de um módulo: `finance` casa com `finance.income_recorded`, `finance.entry_approved`... */
  module: z
    .string()
    .max(40)
    .regex(/^[a-z][a-z-]*$/, 'Use só letras minúsculas e hífen.')
    .optional(),
  /** Do instante (inclusive). */
  from: isoInstant.optional(),
  /** Até o instante (inclusive). */
  to: isoInstant.optional(),
  /** Devolvido pela página anterior (`nextCursor`): traz os registros MAIS ANTIGOS que ela. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_AUDIT_PAGE_SIZE).optional(),
});
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  actorId: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  /** Contexto técnico (contagens, nomes de campos). Nunca dado pessoal. */
  metadata: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .nullable(),
  occurredAt: z.iso.datetime(),
});
export type AuditEntryView = z.infer<typeof auditEntrySchema>;

export const auditPageSchema = z.object({
  /** Do mais recente para o mais antigo. */
  items: z.array(auditEntrySchema),
  /** `null` na última página. */
  nextCursor: z.string().nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;
