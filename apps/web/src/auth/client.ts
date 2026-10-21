import {
  accessTokenResponseSchema,
  currentUserSchema,
  loginResponseSchema,
  problemDetailsSchema,
  type AccessTokenResponse,
  type CurrentUser,
  type LoginResponse,
} from '@igreja/contracts';
import { API_URL } from '../api/health';

/**
 * Falha ao falar com a API. `code` é o código estável do servidor (ex.: `identity.invalid_credentials`) ou um dos
 * nossos para o que nem chegou ao servidor (`network`, `http.unknown`). `message` já vem em português, pronta para a tela.
 */
/** O que precisamos de um schema Zod (sem depender do pacote aqui): validar sem lançar exceção. */
interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const NETWORK_MESSAGE =
  'Não foi possível conectar ao servidor. Verifique a conexão e tente de novo.';
const UNKNOWN_MESSAGE =
  'Algo deu errado do nosso lado. Tente novamente em instantes.';

export interface AuthClient {
  login(email: string, password: string): Promise<LoginResponse>;
  /**
   * Troca o cookie de renovação por um token de acesso novo. Chamadas simultâneas SÃO UMA SÓ: o servidor trata a
   * reapresentação de um cookie já trocado como roubo e derruba a sessão inteira, então duas chamadas em paralelo
   * (ex.: o React em modo de desenvolvimento executa efeitos duas vezes) acabariam deslogando a pessoa.
   */
  refresh(): Promise<AccessTokenResponse>;
  me(accessToken: string): Promise<CurrentUser>;
  logout(): Promise<void>;
}

export interface AuthClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  /**
   * Garante que só uma aba renove por vez. Padrão: Web Locks do navegador. Sem isso, duas abas abertas ao mesmo tempo
   * renovariam com o mesmo cookie e a segunda seria tratada como reuso.
   */
  runExclusive?: <T>(task: () => Promise<T>) => Promise<T>;
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const send = options.fetch ?? ((...args) => fetch(...args));
  const baseUrl = options.baseUrl ?? API_URL;
  const runExclusive = options.runExclusive ?? browserLock;

  async function request<T>(
    path: string,
    init: { method: string; body?: unknown; accessToken?: string },
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
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
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
  }

  let refreshing: Promise<AccessTokenResponse> | null = null;

  return {
    login: (email, password) =>
      request(
        '/auth/login',
        { method: 'POST', body: { email, password } },
        loginResponseSchema,
      ),

    refresh() {
      if (!refreshing) {
        refreshing = runExclusive(() =>
          request(
            '/auth/refresh',
            { method: 'POST' },
            accessTokenResponseSchema,
          ),
        ).finally(() => {
          refreshing = null;
        });
      }
      return refreshing;
    },

    me: (accessToken) =>
      request('/auth/me', { method: 'GET', accessToken }, currentUserSchema),

    logout: () => request('/auth/logout', { method: 'POST' }, null),
  };
}

async function errorFrom(response: Response): Promise<ApiError> {
  const problem = problemDetailsSchema.safeParse(await readJson(response));
  return problem.success
    ? new ApiError(response.status, problem.data.code, problem.data.detail)
    : new ApiError(response.status, 'http.unknown', UNKNOWN_MESSAGE);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function browserLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request('igreja-refresh', task) : task();
}
