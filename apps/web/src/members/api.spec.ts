import { describe, expect, it, vi } from 'vitest';
import type { AuthorizedApi } from '../auth/authorized-api';
import { createMembersApi, toQueryString } from './api';

describe('toQueryString', () => {
  it('só inclui o que foi informado', () => {
    expect(toQueryString({})).toBe('');
    expect(toQueryString({ search: '', status: undefined })).toBe('');
    expect(toQueryString({ search: 'maria', limit: 20, offset: 0 })).toBe(
      '?search=maria&limit=20&offset=0',
    );
  });

  it('codifica o texto: nome com & ou espaços não vira outro parâmetro', () => {
    expect(toQueryString({ search: 'João & Maria' })).toBe(
      '?search=Jo%C3%A3o+%26+Maria',
    );
  });
});

describe('createMembersApi', () => {
  function fakeApi() {
    const request = vi.fn(
      (_url: string, _init: { method: string; body?: unknown }) =>
        Promise.resolve(undefined),
    );
    return { api: { request } as unknown as AuthorizedApi, request };
  }

  it('rotas e métodos', async () => {
    const { api, request } = fakeApi();
    const members = createMembersApi(api);

    await members.update('m1', { fullName: 'X Y' });
    await members.changeStatus('m1', { status: 'AWAY' });
    await members.transfer('m1', { congregationId: 'c2' });
    await members.recordEvent('m1', {
      type: 'BAPTISM',
      occurredOn: '2010-03-14',
    });
    await members.anonymize('m1');

    expect(request.mock.calls.map(([url, init]) => [init.method, url])).toEqual(
      [
        ['PATCH', '/members/m1'],
        ['POST', '/members/m1/status'],
        ['POST', '/members/m1/transfer'],
        ['POST', '/members/m1/history'],
        ['POST', '/members/m1/anonymize'],
      ],
    );
  });

  it('o id vai codificado na URL: um id estranho não muda a rota', async () => {
    const { api, request } = fakeApi();

    await createMembersApi(api).anonymize('../organization');

    expect(request.mock.calls[0]?.[0]).toBe(
      '/members/..%2Forganization/anonymize',
    );
  });

  it('anonimizar não envia corpo', async () => {
    const { api, request } = fakeApi();

    await createMembersApi(api).anonymize('m1');

    expect(request.mock.calls[0]?.[1]).toEqual({ method: 'POST' });
  });
});
