import { ApiError, type Http, type Parser } from './http';

/** O que o cliente autenticado precisa da sessão (o `SessionManager` cumpre; nos testes, um falso). */
export interface SessionAccess {
  getAccessToken(): string | null;
  renewAccessToken(): Promise<string | null>;
}

export interface AuthorizedApi {
  request<T>(
    path: string,
    init: { method: string; body?: unknown },
    schema: Parser<T> | null,
  ): Promise<T>;
}

const SESSION_ENDED = () =>
  new ApiError(
    401,
    'identity.session_invalid',
    'Sua sessão terminou. Entre novamente.',
  );

/**
 * Chamadas à API que exigem login. Envia o token de acesso; se a API responder 401 (o token venceu entre duas
 * renovações automáticas), renova UMA vez e repete. Se ainda assim for recusado, a sessão acabou de verdade: o erro
 * sobe e o `SessionManager` já deixou o estado anônimo (a tela volta para a entrada).
 *
 * Repetir é seguro porque o 401 do guard acontece ANTES de qualquer efeito: a requisição original não chegou a executar.
 */
export function createAuthorizedApi(
  http: Http,
  session: SessionAccess,
): AuthorizedApi {
  return {
    async request(path, init, schema) {
      const first = session.getAccessToken();
      if (!first) throw SESSION_ENDED();

      try {
        return await http.request(
          path,
          { ...init, accessToken: first },
          schema,
        );
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;

        const renewed = await session.renewAccessToken();
        if (!renewed) throw error;
        return http.request(path, { ...init, accessToken: renewed }, schema);
      }
    },
  };
}
