import { describe, expect, it, vi } from 'vitest';
import { createAuthorizedApi, type SessionAccess } from './authorized-api';
import { ApiError, type Http } from './http';

const unauthorized = () =>
  new ApiError(401, 'identity.session_invalid', 'Sessão inválida.');

/** `Http` falso: cada chamada devolve (ou lança) o próximo item da fila e guarda com qual token foi feita. */
function fakeHttp(...outcomes: (unknown | Error)[]) {
  const queue = [...outcomes];
  const tokens: (string | undefined)[] = [];
  const http: Http = {
    request: vi.fn((_path, init) => {
      tokens.push(init.accessToken);
      const next = queue.shift();
      return next instanceof Error
        ? Promise.reject(next)
        : Promise.resolve(next);
    }) as Http['request'],
  };
  return { http, tokens };
}

const sessionWith = (
  token: string | null,
  renewed: string | null = null,
): SessionAccess & { renewAccessToken: ReturnType<typeof vi.fn> } => ({
  getAccessToken: () => token,
  renewAccessToken: vi.fn(() => Promise.resolve(renewed)),
});

const get = { method: 'GET' };

describe('createAuthorizedApi', () => {
  it('envia o token de acesso e devolve a resposta', async () => {
    const { http, tokens } = fakeHttp({ ok: 1 });
    const api = createAuthorizedApi(http, sessionWith('t1'));

    expect(await api.request('/x', get, null)).toEqual({ ok: 1 });
    expect(tokens).toEqual(['t1']);
  });

  it('sem sessão, nem chama a API: erro de sessão terminada', async () => {
    const { http } = fakeHttp();
    const api = createAuthorizedApi(http, sessionWith(null));

    await expect(api.request('/x', get, null)).rejects.toMatchObject({
      status: 401,
      code: 'identity.session_invalid',
    });
    expect(http.request).not.toHaveBeenCalled();
  });

  it('401: renova UMA vez e repete com o token novo', async () => {
    const { http, tokens } = fakeHttp(unauthorized(), { ok: 2 });
    const session = sessionWith('velho', 'novo');
    const api = createAuthorizedApi(http, session);

    expect(await api.request('/x', get, null)).toEqual({ ok: 2 });
    expect(tokens).toEqual(['velho', 'novo']);
    expect(session.renewAccessToken).toHaveBeenCalledTimes(1);
  });

  it('401 de novo depois de renovar: desiste (sem laço) e devolve o erro', async () => {
    const { http, tokens } = fakeHttp(unauthorized(), unauthorized());
    const api = createAuthorizedApi(http, sessionWith('velho', 'novo'));

    await expect(api.request('/x', get, null)).rejects.toMatchObject({
      status: 401,
    });
    expect(tokens).toEqual(['velho', 'novo']);
  });

  it('sessão acabou na renovação: devolve o 401 original, sem repetir', async () => {
    const { http, tokens } = fakeHttp(unauthorized());
    const api = createAuthorizedApi(http, sessionWith('velho', null));

    await expect(api.request('/x', get, null)).rejects.toMatchObject({
      status: 401,
    });
    expect(tokens).toEqual(['velho']);
  });

  it.each([403, 404, 409, 422, 500])(
    'erro %s não renova nem repete',
    async (status) => {
      const { http } = fakeHttp(new ApiError(status, 'x', 'm'));
      const session = sessionWith('t1', 't2');
      const api = createAuthorizedApi(http, session);

      await expect(api.request('/x', get, null)).rejects.toMatchObject({
        status,
      });
      expect(session.renewAccessToken).not.toHaveBeenCalled();
      expect(http.request).toHaveBeenCalledTimes(1);
    },
  );

  it('falha de rede não renova nem repete', async () => {
    const { http } = fakeHttp(new ApiError(0, 'network', 'sem rede'));
    const session = sessionWith('t1', 't2');
    const api = createAuthorizedApi(http, session);

    await expect(api.request('/x', get, null)).rejects.toMatchObject({
      code: 'network',
    });
    expect(session.renewAccessToken).not.toHaveBeenCalled();
  });
});
