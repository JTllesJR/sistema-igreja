import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAuthClient, type AuthClientOptions } from './client';

const user = {
  id: 'u1',
  organizationId: 'o1',
  email: 'maria@igreja.com',
  mustChangePassword: false,
  roles: [],
};
const loginBody = {
  accessToken: 'token-1',
  accessTokenExpiresAt: '2026-10-21T12:15:00.000Z',
  user,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

/** `fetch` falso que devolve as respostas em ordem e guarda o que recebeu. */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const fn = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (next === undefined) throw new Error('fetch chamado além do previsto');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { fetch: fn as unknown as typeof fetch, calls, fn };
}

const clientWith = (fake: ReturnType<typeof fakeFetch>) =>
  createAuthClient({
    fetch: fake.fetch,
    baseUrl: 'http://api',
    runExclusive: (task) => task(),
  });

describe('login', () => {
  it('envia e-mail e senha com credenciais e devolve a resposta validada', async () => {
    const fake = fakeFetch(json(loginBody));

    const result = await clientWith(fake).login(
      'maria@igreja.com',
      'senha-segura-1',
    );

    expect(result).toEqual(loginBody);
    const { url, init } = fake.calls[0]!;
    expect(url).toBe('http://api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'maria@igreja.com',
      password: 'senha-segura-1',
    });
    expect(init.headers).not.toHaveProperty('Authorization');
  });

  it('erro da API vira ApiError com o código e a mensagem em português do servidor', async () => {
    const fake = fakeFetch(
      json(
        {
          title: 'Unauthorized',
          status: 401,
          code: 'identity.invalid_credentials',
          detail: 'E-mail ou senha incorretos.',
        },
        401,
      ),
    );

    const error = await clientWith(fake)
      .login('a@b.com', 'x')
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: 'identity.invalid_credentials',
      message: 'E-mail ou senha incorretos.',
    });
  });

  it('sem rede: código "network" e mensagem para a pessoa', async () => {
    const fake = fakeFetch(new TypeError('Failed to fetch'));

    const error = await clientWith(fake)
      .login('a@b.com', 'x')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0, code: 'network' });
    expect((error as ApiError).message).toMatch(/conectar/);
  });

  it('resposta de erro que não é da nossa API (ex.: proxy) não vaza o texto dela', async () => {
    const fake = fakeFetch(
      new Response('<html>Bad Gateway</html>', { status: 502 }),
    );

    const error = await clientWith(fake)
      .login('a@b.com', 'x')
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 502, code: 'http.unknown' });
    expect((error as ApiError).message).not.toContain('Bad Gateway');
  });

  it('sucesso com corpo fora do contrato é tratado como erro', async () => {
    const fake = fakeFetch(json({ ola: 1 }));

    await expect(clientWith(fake).login('a@b.com', 'x')).rejects.toMatchObject({
      code: 'http.unknown',
    });
  });
});

describe('refresh', () => {
  const tokens = {
    accessToken: 'token-2',
    accessTokenExpiresAt: '2026-10-21T12:30:00.000Z',
  };

  it('chama a rota de renovação com credenciais e sem corpo', async () => {
    const fake = fakeFetch(json(tokens));

    expect(await clientWith(fake).refresh()).toEqual(tokens);
    const { url, init } = fake.calls[0]!;
    expect(url).toBe('http://api/auth/refresh');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('chamadas simultâneas viram UMA requisição (reuso do cookie derrubaria a sessão)', async () => {
    const fake = fakeFetch(json(tokens));
    const client = clientWith(fake);

    const [a, b] = await Promise.all([client.refresh(), client.refresh()]);

    expect(a).toEqual(tokens);
    expect(b).toEqual(tokens);
    expect(fake.fn).toHaveBeenCalledTimes(1);
  });

  it('depois de terminar, uma nova chamada faz uma nova requisição', async () => {
    const fake = fakeFetch(json(tokens), json(tokens));
    const client = clientWith(fake);

    await client.refresh();
    await client.refresh();

    expect(fake.fn).toHaveBeenCalledTimes(2);
  });

  it('uma falha não trava as próximas tentativas', async () => {
    const fake = fakeFetch(new TypeError('offline'), json(tokens));
    const client = clientWith(fake);

    await expect(client.refresh()).rejects.toMatchObject({ code: 'network' });
    expect(await client.refresh()).toEqual(tokens);
  });

  it('passa pelo bloqueio entre abas', async () => {
    const fake = fakeFetch(json(tokens));
    const runExclusive = vi.fn((task: () => Promise<unknown>) => task());
    const client = createAuthClient({
      fetch: fake.fetch,
      baseUrl: 'http://api',
      runExclusive: runExclusive as AuthClientOptions['runExclusive'],
    });

    await client.refresh();

    expect(runExclusive).toHaveBeenCalledTimes(1);
  });
});

describe('me e logout', () => {
  it('me envia o token de acesso no cabeçalho Authorization', async () => {
    const fake = fakeFetch(json(user));

    expect(await clientWith(fake).me('token-1')).toEqual(user);
    expect(fake.calls[0]!.init.headers).toMatchObject({
      Authorization: 'Bearer token-1',
    });
  });

  it('logout aceita a resposta 204 sem corpo', async () => {
    const fake = fakeFetch(new Response(null, { status: 204 }));

    await expect(clientWith(fake).logout()).resolves.toBeUndefined();
    expect(fake.calls[0]!.init.credentials).toBe('include');
  });
});
