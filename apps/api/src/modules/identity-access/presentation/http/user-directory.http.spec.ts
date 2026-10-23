import { userDirectoryEntrySchema } from '@igreja/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import {
  type HttpTestApp,
  startHttpTestApp,
  TEST_ADMIN_EMAIL,
  TEST_PASSWORD,
} from './testing/http-test-app.js';

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

async function login(app: HttpTestApp, email: string) {
  const response = await request(app.server)
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return { Authorization: `Bearer ${response.body.accessToken as string}` };
}

/** Quem pediu (usuário 1), quem lê o financeiro, quem só lê membros, um desativado e alguém de OUTRA igreja. */
async function start() {
  const app = await startHttpTestApp();
  running.push(app);
  const requester = await app.addUser(1, { permissions: ['finance:write'] });
  const financeReader = await app.addUser(2, { permissions: ['finance:read'] });
  const auditor = await app.addUser(3, { permissions: ['audit:read'] });
  const membersOnly = await app.addUser(4, { permissions: ['members:read'] });
  const disabled = await app.addUser(5, {
    permissions: [],
    status: 'DISABLED',
  });
  const stranger = await app.addUser(6, {
    permissions: ['finance:write'],
    organizationId: OrganizationId.of(uuidFor(2)),
  });
  return {
    app,
    ids: {
      requester: requester.id,
      disabled: disabled.id,
      stranger: stranger.id,
    },
    auth: {
      admin: await login(app, TEST_ADMIN_EMAIL),
      financeReader: await login(app, financeReader.email),
      auditor: await login(app, auditor.email),
      membersOnly: await login(app, membersOnly.email),
    },
    emails: { requester: requester.email, stranger: stranger.email },
  };
}

const get = (
  app: HttpTestApp,
  auth: { Authorization: string },
  ids: string[] | string,
) =>
  request(app.server)
    .get(`/users/directory?ids=${Array.isArray(ids) ? ids.join(',') : ids}`)
    .set(auth);

describe('GET /users/directory', () => {
  it('sem login: 401', async () => {
    const { app, ids } = await start();

    expect(
      (await request(app.server).get(`/users/directory?ids=${ids.requester}`))
        .status,
    ).toBe(401);
  });

  it('quem lê o financeiro, quem lê a trilha e o Administrador resolvem ids; quem só lê membros, não (403)', async () => {
    const { app, ids, auth } = await start();

    for (const allowed of [auth.financeReader, auth.auditor, auth.admin]) {
      expect((await get(app, allowed, [ids.requester])).status).toBe(200);
    }
    const denied = await get(app, auth.membersOnly, [ids.requester]);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('identity.permission_denied');
  });

  it('devolve e-mail e situação no formato do contrato, e nada além disso', async () => {
    const { app, ids, auth, emails } = await start();

    const response = await get(app, auth.financeReader, [
      ids.requester,
      ids.disabled,
    ]);

    const parsed = (response.body as unknown[]).map((e) =>
      userDirectoryEntrySchema.parse(e),
    );
    expect(parsed.find((e) => e.id === ids.requester)).toEqual({
      id: ids.requester,
      email: emails.requester,
      active: true,
    });
    expect(parsed.find((e) => e.id === ids.disabled)?.active).toBe(false);
    for (const entry of response.body as object[]) {
      expect(Object.keys(entry).sort()).toEqual(['active', 'email', 'id']);
    }
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|argon2|roles|lastLoginAt/,
    );
  });

  it('usuário de OUTRA igreja e id desconhecido não aparecem (igual a inexistente)', async () => {
    const { app, ids, auth, emails } = await start();

    const response = await get(app, auth.financeReader, [
      ids.requester,
      ids.stranger,
      uuidFor(7777),
    ]);

    expect((response.body as { id: string }[]).map((e) => e.id)).toEqual([
      ids.requester,
    ]);
    expect(JSON.stringify(response.body)).not.toContain(emails.stranger);
  });

  it('não é uma lista de usuários: sem `ids` não devolve ninguém (400), e há um teto por consulta', async () => {
    const { app, auth } = await start();

    for (const query of ['', 'não-é-uuid', `${uuidFor(1)},xyz`]) {
      expect((await get(app, auth.admin, query)).status, query).toBe(400);
    }
    expect(
      (await request(app.server).get('/users/directory').set(auth.admin))
        .status,
    ).toBe(400);
    const tooMany = Array.from({ length: 51 }, (_, n) => uuidFor(6000 + n));
    expect((await get(app, auth.admin, tooMany)).status).toBe(400);
    expect((await get(app, auth.admin, tooMany.slice(0, 50))).status).toBe(200);
  });
});
