import { problemDetailsSchema } from '@igreja/contracts';
import { API_URL } from '../api/health';

/** O que precisamos de um schema Zod (sem depender do pacote aqui): validar sem lançar exceção. */
export interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Um problema numa entrada malformada (HTTP 400): o campo (`serviceTimes.0.time`) e o que está errado. */
export interface Issue {
  path: string;
  message: string;
}

/**
 * Falha ao falar com a API. `code` é o código estável do servidor (ex.: `identity.invalid_credentials`) ou um dos
 * nossos para o que nem chegou ao servidor (`network`, `http.unknown`). `message` já vem em português, pronta para a tela.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues: readonly Issue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE =
  'Não foi possível conectar ao servidor. Verifique a conexão e tente de novo.';
const UNKNOWN_MESSAGE =
  'Algo deu errado do nosso lado. Tente novamente em instantes.';

export interface HttpOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
}

export interface RequestInitLite {
  method: string;
  body?: unknown;
  accessToken?: string;
}

export interface Http {
  request<T>(
    path: string,
    init: RequestInitLite,
    schema: Parser<T> | null,
  ): Promise<T>;
}

/**
 * Único lugar que chama `fetch` (ADR 0011): envia JSON com credenciais (cookie de renovação), converte erro em
 * `ApiError` e só devolve resposta que passou no schema do contrato.
 */
export function createHttp(options: HttpOptions = {}): Http {
  const send = options.fetch ?? ((...args) => fetch(...args));
  const baseUrl = options.baseUrl ?? API_URL;

  return {
    async request<T>(
      path: string,
      init: RequestInitLite,
      schema: Parser<T> | null,
    ): Promise<T> {
      let response: Response;
      try {
        response = await send(`${baseUrl}${path}`, {
          method: init.method,
          // Necessário para o navegador enviar e receber o cookie de renovação (API em outra origem, ADR 0011).
          credentials: 'include',
          headers: {
            ...(init.body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
            ...(init.accessToken
              ? { Authorization: `Bearer ${init.accessToken}` }
              : {}),
          },
          ...(init.body === undefined
            ? {}
            : { body: JSON.stringify(init.body) }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new ApiError(0, 'network', NETWORK_MESSAGE);
      }

      if (!response.ok) throw await errorFrom(response);
      if (schema === null) return undefined as T;

      const parsed = schema.safeParse(await readJson(response));
      if (!parsed.success)
        throw new ApiError(response.status, 'http.unknown', UNKNOWN_MESSAGE);
      return parsed.data;
    },
  };
}

async function errorFrom(response: Response): Promise<ApiError> {
  const problem = problemDetailsSchema.safeParse(await readJson(response));
  return problem.success
    ? new ApiError(
        response.status,
        problem.data.code,
        problem.data.detail,
        problem.data.errors,
      )
    : new ApiError(response.status, 'http.unknown', UNKNOWN_MESSAGE);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
