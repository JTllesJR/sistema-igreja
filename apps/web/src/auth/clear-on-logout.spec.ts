import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { AuthClient } from './client';
import { clearCacheOnLogout } from './clear-on-logout';
import { SessionManager } from './session';

const user = { id: 'u', organizationId: 'o', email: 'a@b.com', roles: [] };
const client = (): AuthClient => ({
  login: vi.fn(() =>
    Promise.resolve({
      accessToken: 't',
      accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
      user,
    }),
  ),
  refresh: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(() => Promise.resolve()),
});

describe('clearCacheOnLogout', () => {
  it('ao sair, esvazia o cache: nada de dado de membro sobra na memória', async () => {
    const session = new SessionManager(client());
    const cache = new QueryClient();
    clearCacheOnLogout(session, cache);
    await session.login('a@b.com', 'senha');
    cache.setQueryData(['members', 'detail', 'm1'], { fullName: 'Maria' });
    expect(cache.getQueryData(['members', 'detail', 'm1'])).toBeDefined();

    await session.logout();

    expect(cache.getQueryData(['members', 'detail', 'm1'])).toBeUndefined();
  });

  it('enquanto a sessão segue ativa, o cache é mantido', async () => {
    const session = new SessionManager(client());
    const cache = new QueryClient();
    clearCacheOnLogout(session, cache);

    await session.login('a@b.com', 'senha');
    cache.setQueryData(['members', 'list'], { items: [] });
    await session.login('a@b.com', 'senha');

    expect(cache.getQueryData(['members', 'list'])).toBeDefined();
  });

  it('a sessão que termina por renovação recusada também esvazia o cache', async () => {
    const authClient = client();
    authClient.refresh = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('x'), {
          status: 401,
          code: 'identity.session_invalid',
        }),
      ),
    );
    const session = new SessionManager(authClient);
    const cache = new QueryClient();
    clearCacheOnLogout(session, cache);
    await session.login('a@b.com', 'senha');
    cache.setQueryData(['members', 'list'], { items: [] });

    await session.renewAccessToken();

    expect(session.getState().status).toBe('anonymous');
    expect(cache.getQueryData(['members', 'list'])).toBeUndefined();
  });

  it('devolve a função que cancela a assinatura', async () => {
    const session = new SessionManager(client());
    const cache = new QueryClient();
    const stop = clearCacheOnLogout(session, cache);
    stop();
    await session.login('a@b.com', 'senha');
    cache.setQueryData(['x'], 1);

    await session.logout();

    expect(cache.getQueryData(['x'])).toBe(1);
  });
});
