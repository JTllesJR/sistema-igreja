import { describe, expect, it, vi } from 'vitest';
import type { AuthorizedApi } from '../auth/authorized-api';
import { createUsersApi } from './api';

function fakeApi() {
  const request = vi.fn(
    (_url: string, _init: { method: string; body?: unknown }) =>
      Promise.resolve(undefined),
  );
  return { api: { request } as unknown as AuthorizedApi, request };
}

const call = (request: ReturnType<typeof fakeApi>['request'], index = 0) => {
  const [url, init] = request.mock.calls[index] ?? [];
  return { url, method: init?.method, body: init?.body };
};

describe('createUsersApi', () => {
  it('rotas e métodos', async () => {
    const { api, request } = fakeApi();
    const users = createUsersApi(api);
    const assignment = { roleId: 'r1', congregationId: null };

    await users.list();
    await users.roles();
    await users.create({
      email: 'a@b.com',
      roleId: 'r1',
      congregationId: null,
    });
    await users.assignRole('u1', assignment);
    await users.revokeRole('u1', assignment);
    await users.disable('u1');
    await users.enable('u1');
    await users.resetPassword('u1');

    expect(request.mock.calls.map(([url, init]) => [init.method, url])).toEqual(
      [
        ['GET', '/users'],
        ['GET', '/roles'],
        ['POST', '/users'],
        ['POST', '/users/u1/assignments'],
        ['POST', '/users/u1/assignments/revoke'],
        ['POST', '/users/u1/disable'],
        ['POST', '/users/u1/enable'],
        ['POST', '/users/u1/reset-password'],
      ],
    );
  });

  it('o id vai codificado na URL: um id estranho não muda a rota', async () => {
    const { api, request } = fakeApi();

    await createUsersApi(api).resetPassword('../roles');

    expect(call(request).url).toBe('/users/..%2Froles/reset-password');
  });

  it('atribuir e revogar levam o papel e o escopo (null = igreja toda) no corpo', async () => {
    const { api, request } = fakeApi();
    const users = createUsersApi(api);

    await users.assignRole('u1', { roleId: 'r1', congregationId: 'c1' });
    await users.revokeRole('u1', { roleId: 'r1', congregationId: null });

    expect(call(request, 0).body).toEqual({
      roleId: 'r1',
      congregationId: 'c1',
    });
    expect(call(request, 1).body).toEqual({
      roleId: 'r1',
      congregationId: null,
    });
  });

  it('desativar, reativar e redefinir não enviam corpo', async () => {
    const { api, request } = fakeApi();
    const users = createUsersApi(api);

    await users.disable('u1');
    await users.enable('u1');
    await users.resetPassword('u1');

    for (const index of [0, 1, 2]) {
      expect(request.mock.calls[index]?.[1]).toEqual({ method: 'POST' });
    }
  });
});
