import { z } from 'zod';

/**
 * Contratos do módulo `finance` (ADR 0015). Dinheiro SEMPRE em centavos inteiros (nunca decimal, ADR 0005).
 *
 * Os limites só barram entrada absurda e deixam a web validar cedo; as regras de verdade (data não futura, saldo, quem
 * pode aprovar, categoria do sentido certo) vivem no domínio da API, que responde 422/403/409 com a mensagem.
 *
 * QUEM contribuiu é dado sensível (ADR 0006): `member` só vem preenchido para quem tem `finance:read-individual`; os
 * demais recebem apenas `memberLinked`.
 */

const text = (max: number) => z.string().max(max);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.');

/** O mesmo teto do domínio e do banco: R$ 100 milhões por lançamento, em centavos. */
export const MAX_ENTRY_CENTS = 10_000_000_000;
const cents = z.number().int().min(1).max(MAX_ENTRY_CENTS);

export const ACCOUNT_KINDS = ['CASH', 'BANK'] as const;
export const accountKindSchema = z.enum(ACCOUNT_KINDS);
export type AccountKind = z.infer<typeof accountKindSchema>;

export const ENTRY_DIRECTIONS = ['IN', 'OUT'] as const;
export const entryDirectionSchema = z.enum(ENTRY_DIRECTIONS);
export type EntryDirection = z.infer<typeof entryDirectionSchema>;

export const ENTRY_KINDS = [
  'ORDINARY',
  'OPENING_BALANCE',
  'TRANSFER',
  'REVERSAL',
] as const;
export const entryKindSchema = z.enum(ENTRY_KINDS);
export type EntryKind = z.infer<typeof entryKindSchema>;

export const ENTRY_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
] as const;
export const entryStatusSchema = z.enum(ENTRY_STATUSES);
export type EntryStatus = z.infer<typeof entryStatusSchema>;

export const archiveStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export type ArchiveStatus = z.infer<typeof archiveStatusSchema>;

/** Parâmetro de URL booleano: chega como "true" ou "false". */
const queryBoolean = z.enum(['true', 'false']).transform((v) => v === 'true');

// ---- Contas e categorias -----------------------------------------------------------------------------------------

export const createAccountRequestSchema = z.object({
  congregationId: z.uuid(),
  name: text(120),
  kind: accountKindSchema,
});
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

/** Campo ausente = manter. `archived: true` arquiva; `false` reativa. Conta nunca é apagada. */
export const updateAccountRequestSchema = z.object({
  name: text(120).optional(),
  archived: z.boolean().optional(),
});
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

export const listAccountsQuerySchema = z.object({
  includeArchived: queryBoolean.optional(),
  congregationId: z.uuid().optional(),
});
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>;

export const accountSchema = z.object({
  id: z.string(),
  congregationId: z.string(),
  name: z.string(),
  kind: accountKindSchema,
  status: archiveStatusSchema,
  /** Saldo CONFIRMADO, em centavos. */
  balanceCents: z.number().int(),
});
export type Account = z.infer<typeof accountSchema>;

export const createCategoryRequestSchema = z.object({
  name: text(120),
  direction: entryDirectionSchema,
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const updateCategoryRequestSchema = z.object({
  name: text(120).optional(),
  archived: z.boolean().optional(),
});
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const listCategoriesQuerySchema = z.object({
  includeArchived: queryBoolean.optional(),
});
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  direction: entryDirectionSchema,
  status: archiveStatusSchema,
});
export type Category = z.infer<typeof categorySchema>;

export const defaultCategoriesResultSchema = z.object({
  created: z.number().int(),
});
export type DefaultCategoriesResult = z.infer<
  typeof defaultCategoriesResultSchema
>;

export const financeCreatedSchema = z.object({ id: z.string() });
export type FinanceCreated = z.infer<typeof financeCreatedSchema>;

// ---- Lançamentos -------------------------------------------------------------------------------------------------

export const recordIncomeRequestSchema = z.object({
  accountId: z.uuid(),
  categoryId: z.uuid(),
  amountCents: cents,
  occurredOn: isoDate,
  description: text(300).nullish(),
  /** Quem contribuiu. Ausente = anônimo. Exige `finance:read-individual`. */
  memberId: z.uuid().nullish(),
});
export type RecordIncomeRequest = z.infer<typeof recordIncomeRequestSchema>;

export const requestExpenseRequestSchema = z.object({
  accountId: z.uuid(),
  categoryId: z.uuid(),
  amountCents: cents,
  occurredOn: isoDate,
  description: text(300).nullish(),
});
export type RequestExpenseRequest = z.infer<typeof requestExpenseRequestSchema>;

export const requestOpeningBalanceRequestSchema = z.object({
  accountId: z.uuid(),
  amountCents: cents,
  occurredOn: isoDate,
  description: text(300).nullish(),
});
export type RequestOpeningBalanceRequest = z.infer<
  typeof requestOpeningBalanceRequestSchema
>;

export const requestTransferRequestSchema = z.object({
  fromAccountId: z.uuid(),
  toAccountId: z.uuid(),
  amountCents: cents,
  occurredOn: isoDate,
  description: text(300).nullish(),
});
export type RequestTransferRequest = z.infer<
  typeof requestTransferRequestSchema
>;

export const transferCreatedSchema = z.object({ transferId: z.string() });
export type TransferCreated = z.infer<typeof transferCreatedSchema>;

export const requestReversalRequestSchema = z.object({
  reason: text(300),
  /** Dia do estorno. Padrão: hoje. */
  occurredOn: isoDate.optional(),
});
export type RequestReversalRequest = z.infer<
  typeof requestReversalRequestSchema
>;

export const rejectEntryRequestSchema = z.object({ note: text(300) });
export type RejectEntryRequest = z.infer<typeof rejectEntryRequestSchema>;

export const MAX_FINANCE_PAGE_SIZE = 100;

export const listEntriesQuerySchema = z.object({
  congregationId: z.uuid().optional(),
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  status: entryStatusSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_FINANCE_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});
export type ListEntriesQuery = z.infer<typeof listEntriesQuerySchema>;

export const listApprovalsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FINANCE_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;

export const entrySchema = z.object({
  id: z.string(),
  congregationId: z.string(),
  accountId: z.string(),
  kind: entryKindSchema,
  direction: entryDirectionSchema,
  amountCents: z.number().int(),
  occurredOn: z.string(),
  description: z.string().nullable(),
  categoryId: z.string().nullable(),
  /** Há um membro ligado? Qualquer leitor sabe; QUEM é, só com `finance:read-individual`. */
  memberLinked: z.boolean(),
  member: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
  transferId: z.string().nullable(),
  reversesEntryId: z.string().nullable(),
  status: entryStatusSchema,
  requestedBy: z.string(),
  requestedAt: z.iso.datetime(),
  decidedBy: z.string().nullable(),
  decidedAt: z.iso.datetime().nullable(),
  decisionNote: z.string().nullable(),
});
export type Entry = z.infer<typeof entrySchema>;

export const entryListResponseSchema = z.object({
  items: z.array(entrySchema),
  total: z.number().int(),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type EntryListResponse = z.infer<typeof entryListResponseSchema>;

export const transferDestinationsQuerySchema = z.object({
  fromAccountId: z.uuid(),
});
export type TransferDestinationsQuery = z.infer<
  typeof transferDestinationsQuerySchema
>;

export const transferDestinationSchema = z.object({
  id: z.string(),
  congregationId: z.string(),
  name: z.string(),
  kind: accountKindSchema,
  status: archiveStatusSchema,
});
export type TransferDestination = z.infer<typeof transferDestinationSchema>;

// ---- Painéis -----------------------------------------------------------------------------------------------------

export const dashboardQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  congregationId: z.uuid().optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const dashboardSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  scope: z.enum(['ORGANIZATION', 'CONGREGATIONS']),
  totals: z.object({
    incomeCents: z.number().int(),
    expenseCents: z.number().int(),
    resultCents: z.number().int(),
    transferInCents: z.number().int(),
    transferOutCents: z.number().int(),
    openingBalanceCents: z.number().int(),
  }),
  byCategory: z.array(
    z.object({
      categoryId: z.string(),
      direction: entryDirectionSchema,
      totalCents: z.number().int(),
    }),
  ),
  byCongregation: z.array(
    z.object({
      congregationId: z.string(),
      incomeCents: z.number().int(),
      expenseCents: z.number().int(),
      balanceCents: z.number().int(),
    }),
  ),
  accountBalances: z.array(
    z.object({ accountId: z.string(), balanceCents: z.number().int() }),
  ),
  totalBalanceCents: z.number().int(),
  pendingApprovals: z.number().int(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

// ---- Contribuição individual (dado sensível, leitura auditada) ---------------------------------------------------

export const memberContributionsQuerySchema = z.object({
  /** Início da janela. Ausente = todo o período. */
  since: isoDate.optional(),
});
export type MemberContributionsQuery = z.infer<
  typeof memberContributionsQuerySchema
>;

export const memberContributionsSchema = z.object({
  member: z.object({ id: z.string(), name: z.string() }),
  since: z.string().nullable(),
  netCents: z.number().int(),
  byCategory: z.array(
    z.object({
      categoryId: z.string().nullable(),
      netCents: z.number().int(),
    }),
  ),
  items: z.array(
    z.object({
      id: z.string(),
      congregationId: z.string(),
      occurredOn: z.string(),
      kind: entryKindSchema,
      direction: entryDirectionSchema,
      categoryId: z.string().nullable(),
      amountCents: z.number().int(),
    }),
  ),
});
export type MemberContributions = z.infer<typeof memberContributionsSchema>;

export const searchContributorsQuerySchema = z.object({
  search: text(100),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});
export type SearchContributorsQuery = z.infer<
  typeof searchContributorsQuerySchema
>;

export const contributorSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  congregationId: z.string(),
});
export type Contributor = z.infer<typeof contributorSchema>;
