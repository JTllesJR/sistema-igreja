import { healthResponseSchema, type HealthResponse } from '@igreja/contracts';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type EstadoApi =
  | { tipo: 'online'; saude: HealthResponse }
  /** A API respondeu, mas com algo fora do contrato (ex.: outro serviço na mesma porta). */
  | { tipo: 'resposta-invalida' }
  | { tipo: 'offline' };

/**
 * Consulta GET /health. Nunca lança: falha de rede vira `offline`, e o corpo é validado
 * com o mesmo schema que a API usa para produzi-lo (packages/contracts).
 * O health devolve 503 quando o banco cai, mas com o mesmo corpo, por isso não olhamos só o status HTTP.
 */
export async function consultarSaude(
  buscar: typeof fetch = fetch,
  baseUrl: string = API_URL,
): Promise<EstadoApi> {
  let resposta: Response;
  try {
    resposta = await buscar(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return { tipo: 'offline' };
  }
  try {
    const corpo: unknown = await resposta.json();
    const resultado = healthResponseSchema.safeParse(corpo);
    return resultado.success
      ? { tipo: 'online', saude: resultado.data }
      : { tipo: 'resposta-invalida' };
  } catch {
    return { tipo: 'resposta-invalida' };
  }
}
