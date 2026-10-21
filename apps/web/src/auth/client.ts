import {
  accessTokenResponseSchema,
  currentUserSchema,
  loginResponseSchema,
  type AccessTokenResponse,
  type CurrentUser,
  type LoginResponse,
} from '@igreja/contracts';
import { createHttp, type HttpOptions } from './http';

export { ApiError } from './http';

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

export interface AuthClientOptions extends HttpOptions {
  /**
   * Garante que só uma aba renove por vez. Padrão: Web Locks do navegador. Sem isso, duas abas abertas ao mesmo tempo
   * renovariam com o mesmo cookie e a segunda seria tratada como reuso.
   */
  runExclusive?: <T>(task: () => Promise<T>) => Promise<T>;
}

export function createAuthClient(options: AuthClientOptions = {}): AuthClient {
  const { request } = createHttp(options);
  const runExclusive = options.runExclusive ?? browserLock;

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

function browserLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request('igreja-refresh', task) : task();
}
