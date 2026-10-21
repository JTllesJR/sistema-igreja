import { z } from 'zod';

/**
 * Corpo de erro da API (RFC 9457, `application/problem+json`; ADR 0011, seção 6). O cliente mostra `detail`
 * (já em português) e reage ao `code`, que é estável. `errors` só existe para entrada malformada (HTTP 400).
 */
export const problemDetailsSchema = z.object({
  title: z.string(),
  status: z.number().int(),
  code: z.string(),
  detail: z.string(),
  requestId: z.string().optional(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
