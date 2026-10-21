import { z } from 'zod';

/**
 * Contrato das variáveis de ambiente da API. Validado uma única vez no boot:
 * se algo estiver errado, a aplicação não sobe e a mensagem diz exatamente o quê.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\/.+/, 'deve ser uma URL postgresql://...'),

  // Segredo de assinatura dos tokens de acesso (HS256, ADR 0010). Sem valor padrão de propósito: um segredo
  // "de exemplo" esquecido em produção permitiria forjar logins. Gere com: openssl rand -base64 48
  JWT_SECRET: z.string().min(32, 'deve ter pelo menos 32 caracteres'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(900),
  // O teto de 90 dias é o limite absoluto de uma sessão (ADR 0010): um prazo ocioso maior não faria sentido.
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${problems}`);
  }

  return result.data;
}
