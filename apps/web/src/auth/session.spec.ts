import type {
  AccessTokenResponse,
  CurrentUser,
  LoginResponse,
} from '@igreja/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type AuthClient } from './client';
import { SessionManager, msUntilRenewal, type Timers } from './session';

const user: CurrentUser = {
  id: 'u1',
  organizationId: 'o1',
  mustChangePassword: false,
  email: 'maria@igreja.com',
  roles: [],
};
const T0 = Date.parse('2026-10-21T12:00:00.000Z');
const inMinutes = (n: number) => new Date(T0 + n * 60_000).toISOString();
const tokens = (token: string, minutes = 15): AccessTokenResponse => ({
  accessToken: token,
  accessTokenExpiresAt: inMinutes(minutes),
});

/** Relógio e temporizadores controláveis: o teste decide quando o tempo passa. */
class FakeTimers implements Timers {
  current = T0;
  #next = 1;
  readonly #pending = new Map<number, { at: number; task: () => void }>();

  now(): number {
    return this.current;
  }
  setTimeout(task: () => void, ms: number): unknown {
    const id = this.#next++;
    this.#pending.set(id, { at: this.current + ms, task });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.#pending.delete(handle as number);
  }
  get pendingCount(): number {
    return this.#pending.size;
  }
  /** Avança o tempo e dispara o que venceu. */
  advance(ms: number): void {
    this.current += ms;
    for (const [id, entry] of [...this.#pending]) {
      if (entry.at <= this.current) {
        this.#pending.delete(id);
        entry.task();
      }
    }
  }
}

function fakeClient(overrides: Partial<AuthClient> = {}) {
  const client = {
    login: vi.fn((): Promise<LoginResponse> =>
      Promise.resolve({ ...tokens('login-token'), user }),
    ),
    refresh: vi.fn(() => Promise.resolve(tokens('refreshed-token'))),
    me: vi.fn(() => Promise.resolve(user)),
    logout: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  return client satisfies AuthClient;
}

const apiError = (status: number, code: string) =>
  new ApiError(status, code, 'mensagem');

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(overrides: Partial<AuthClient> = {}) {
  const client = fakeClient(overrides);
  const timers = new FakeTimers();
  const session = new SessionManager(client, timers);
  return { client, timers, session };
}

describe('msUntilRenewal', () => {
  it('renova 60 s antes de vencer', () => {
    expect(msUntilRenewal(T0 + 15 * 60_000, T0)).toBe(14 * 60_000);
  });

  it('com prazo curto, renova na metade dele (nunca no passado)', () => {
    expect(msUntilRenewal(T0 + 40_000, T0)).toBe(20_000);
    expect(msUntilRenewal(T0 - 1_000, T0)).toBe(0);
  });
});

describe('restore (ao abrir a página)', () => {
  it('começa "restoring" e, com cookie válido, entra com o usuário e o token em memória', async () => {
    const { session, client } = setup();
    expect(session.getState()).toEqual({ status: 'restoring' });

    await session.restore();

    expect(session.getState()).toEqual({
      status: 'authenticated',
      user,
      accessToken: 'refreshed-token',
    });
    expect(client.me).toHaveBeenCalledWith('refreshed-token');
  });

  it.each([
    ['sessão inválida', apiError(401, 'identity.session_invalid')],
    ['servidor fora do ar', apiError(0, 'network')],
  ])('%s: vira anônimo', async (_nome, error) => {
    const { session } = setup({ refresh: vi.fn(() => Promise.reject(error)) });

    await session.restore();

    expect(session.getState()).toEqual({ status: 'anonymous' });
  });

  it('chamadas repetidas (React StrictMode) compartilham uma única tentativa', async () => {
    const { session, client } = setup();

    await Promise.all([session.restore(), session.restore()]);

    expect(client.refresh).toHaveBeenCalledTimes(1);
  });

  it('avisa quem observa a cada mudança de estado', async () => {
    const { session } = setup();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    await session.restore();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    await session.logout();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('se a pessoa entrou enquanto a recuperação rodava, a recuperação não sobrescreve', async () => {
    let finishRefresh!: (value: AccessTokenResponse) => void;
    const { session } = setup({
      refresh: vi.fn(
        () =>
          new Promise<AccessTokenResponse>(
            (resolve) => (finishRefresh = resolve),
          ),
      ),
    });

    const restoring = session.restore();
    await session.login('maria@igreja.com', 'senha-segura-1');
    finishRefresh(tokens('antigo'));
    await restoring;

    expect(session.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'login-token',
    });
  });
});

describe('login', () => {
  it('entra e guarda o token de acesso em memória', async () => {
    const { session } = setup();

    await session.login('maria@igreja.com', 'senha-segura-1');

    expect(session.getState()).toEqual({
      status: 'authenticated',
      user,
      accessToken: 'login-token',
    });
  });

  it('falha propaga o erro e não muda o estado', async () => {
    const error = apiError(401, 'identity.invalid_credentials');
    const { session } = setup({ login: vi.fn(() => Promise.reject(error)) });
    await session.restore().catch(() => undefined);
    const before = session.getState();

    await expect(session.login('a@b.com', 'x')).rejects.toBe(error);

    expect(session.getState()).toBe(before);
  });
});

describe('renovação automática do token de acesso', () => {
  it('renova antes de vencer, troca o token e agenda a próxima', async () => {
    const { session, client, timers } = setup();
    await session.login('maria@igreja.com', 'senha-segura-1');

    timers.advance(14 * 60_000);
    await flush();

    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(session.getState()).toMatchObject({
      accessToken: 'refreshed-token',
    });
    expect(timers.pendingCount).toBe(1);
  });

  it('não renova antes da hora', async () => {
    const { session, client, timers } = setup();
    await session.login('maria@igreja.com', 'senha-segura-1');

    timers.advance(13 * 60_000);
    await flush();

    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('sessão recusada na renovação: vira anônimo', async () => {
    const { session, timers } = setup({
      refresh: vi.fn(() =>
        Promise.reject(apiError(401, 'identity.session_reuse_detected')),
      ),
    });
    await session.login('maria@igreja.com', 'senha-segura-1');

    timers.advance(14 * 60_000);
    await flush();

    expect(session.getState()).toEqual({ status: 'anonymous' });
  });

  it('rede fora na renovação: continua logado e tenta de novo em 15 s', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(apiError(0, 'network'))
      .mockResolvedValueOnce(tokens('depois-da-rede'));
    const { session, timers } = setup({ refresh });
    await session.login('maria@igreja.com', 'senha-segura-1');

    timers.advance(14 * 60_000);
    await flush();
    expect(session.getState()).toMatchObject({ status: 'authenticated' });
    expect(refresh).toHaveBeenCalledTimes(1);

    timers.advance(15_000);
    await flush();
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(session.getState()).toMatchObject({ accessToken: 'depois-da-rede' });
  });

  it('sair durante uma renovação em andamento não ressuscita a sessão', async () => {
    let finishRefresh!: (value: AccessTokenResponse) => void;
    const { session, timers } = setup({
      refresh: vi.fn(
        () =>
          new Promise<AccessTokenResponse>(
            (resolve) => (finishRefresh = resolve),
          ),
      ),
    });
    await session.login('maria@igreja.com', 'senha-segura-1');
    timers.advance(14 * 60_000);

    await session.logout();
    finishRefresh(tokens('tarde-demais'));
    await flush();

    expect(session.getState()).toEqual({ status: 'anonymous' });
    expect(timers.pendingCount).toBe(0);
  });
});

describe('logout', () => {
  it('fica anônimo, cancela a renovação e avisa o servidor', async () => {
    const { session, client, timers } = setup();
    await session.login('maria@igreja.com', 'senha-segura-1');
    expect(timers.pendingCount).toBe(1);

    await session.logout();

    expect(session.getState()).toEqual({ status: 'anonymous' });
    expect(timers.pendingCount).toBe(0);
    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it('sem rede, sai do mesmo jeito', async () => {
    const { session } = setup({
      logout: vi.fn(() => Promise.reject(apiError(0, 'network'))),
    });
    await session.login('maria@igreja.com', 'senha-segura-1');

    await expect(session.logout()).resolves.toBeUndefined();

    expect(session.getState()).toEqual({ status: 'anonymous' });
  });
});

describe('getAccessToken e renewAccessToken (usados pelo cliente autenticado)', () => {
  it('getAccessToken: null sem sessão, o token com sessão', async () => {
    const { session } = setup();
    expect(session.getAccessToken()).toBeNull();

    await session.login('maria@igreja.com', 'senha-segura-1');
    expect(session.getAccessToken()).toBe('login-token');

    await session.logout();
    expect(session.getAccessToken()).toBeNull();
  });

  it('renova na hora, troca o token em memória, agenda a próxima e devolve o novo', async () => {
    const { session, client, timers } = setup();
    await session.login('maria@igreja.com', 'senha-segura-1');

    expect(await session.renewAccessToken()).toBe('refreshed-token');

    expect(session.getAccessToken()).toBe('refreshed-token');
    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(timers.pendingCount).toBe(1);
  });

  it('dois 401 ao mesmo tempo: ambos recebem o mesmo token novo e só fica uma renovação agendada', async () => {
    // A união das chamadas em uma só requisição é do AuthClient (testada em client.spec.ts); aqui o gerenciador
    // só precisa continuar coerente quando as duas respostas chegam.
    const { session, timers } = setup();
    await session.login('maria@igreja.com', 'senha-segura-1');

    const [a, b] = await Promise.all([
      session.renewAccessToken(),
      session.renewAccessToken(),
    ]);

    expect(a).toBe('refreshed-token');
    expect(b).toBe('refreshed-token');
    expect(session.getAccessToken()).toBe('refreshed-token');
    expect(timers.pendingCount).toBe(1);
  });

  it('sessão recusada: vira anônimo e devolve null', async () => {
    const { session, timers } = setup({
      refresh: vi.fn(() =>
        Promise.reject(apiError(401, 'identity.session_invalid')),
      ),
    });
    await session.login('maria@igreja.com', 'senha-segura-1');

    expect(await session.renewAccessToken()).toBeNull();

    expect(session.getState()).toEqual({ status: 'anonymous' });
    expect(timers.pendingCount).toBe(0);
  });

  it('rede fora: repassa o erro e continua logado', async () => {
    const error = apiError(0, 'network');
    const { session } = setup({ refresh: vi.fn(() => Promise.reject(error)) });
    await session.login('maria@igreja.com', 'senha-segura-1');

    await expect(session.renewAccessToken()).rejects.toBe(error);

    expect(session.getState()).toMatchObject({ status: 'authenticated' });
  });

  it('sem sessão, devolve null sem chamar a API', async () => {
    const { session, client } = setup();

    expect(await session.renewAccessToken()).toBeNull();
    expect(client.refresh).not.toHaveBeenCalled();
  });
});

describe('reloadUser (depois de trocar a senha temporária)', () => {
  const must = { ...user, mustChangePassword: true };

  it('relê o usuário e atualiza o estado, mantendo o token', async () => {
    const { session, client } = setup({
      login: vi.fn(() =>
        Promise.resolve({ ...tokens('login-token'), user: must }),
      ),
      me: vi.fn(() => Promise.resolve({ ...must, mustChangePassword: false })),
    });
    await session.login('maria@igreja.com', 'senha-segura-1');
    expect(session.getState()).toMatchObject({
      user: { mustChangePassword: true },
    });

    await session.reloadUser();

    expect(client.me).toHaveBeenCalledWith('login-token');
    expect(session.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'login-token',
      user: { mustChangePassword: false },
    });
  });

  it('sem sessão, não faz nada', async () => {
    const { session, client } = setup();

    await session.reloadUser();

    expect(client.me).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({ status: 'restoring' });
  });

  it('se a pessoa saiu durante a leitura, não ressuscita a sessão', async () => {
    let finish!: (u: CurrentUser) => void;
    const { session } = setup({
      me: vi.fn(
        () => new Promise<CurrentUser>((resolve) => (finish = resolve)),
      ),
    });
    await session.login('maria@igreja.com', 'senha-segura-1');

    const reloading = session.reloadUser();
    await session.logout();
    finish(user);
    await reloading;

    expect(session.getState()).toEqual({ status: 'anonymous' });
  });

  it('falha da API sobe o erro e não muda o estado', async () => {
    const error = apiError(0, 'network');
    const { session } = setup({ me: vi.fn(() => Promise.reject(error)) });
    await session.login('maria@igreja.com', 'senha-segura-1');
    const before = session.getState();

    await expect(session.reloadUser()).rejects.toBe(error);

    expect(session.getState()).toBe(before);
  });
});
