import { z } from 'zod';

/**
 * Contrato da resposta de GET /health.
 * A API produz este formato e qualquer cliente (web, mobile, monitoramento) pode validá-lo.
 */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    database: z.enum(['up', 'down']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
