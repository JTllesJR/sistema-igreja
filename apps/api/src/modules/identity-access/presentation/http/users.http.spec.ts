import {
  temporaryPasswordResponseSchema,
  type UserSummary,
  userSummarySchema,
} from '@igreja/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import {
  type HttpTestApp,
  startHttpTestApp,
  TEST_ADMIN_EMAIL,
  TEST_ORGANIZATION,
  TEST_PASSWORD,
} from './testing/http-test-app.js';

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

const CONGREGATION = CongregationId.of(uuidFor(1001));
const INACTIVE_CONGREGATION = CongregationId.of(uuidFor(1002));

async function start() {
  const app = await startHttpTestApp();
  app.directory.addCongregation(TEST_ORGANIZATION, CONGREGATION);
  app.directory.addCongregation(
    TEST_ORGANIZATION,
    INACTIVE_CONGREGATION,
    'INACTIVE',
  );
  running.push(app);
  return app;
}

async function authFor(app: HttpTestApp, email: string) {
  const response = await request(app.server)
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return { Authorization: `Bearer ${response.body.accessToken as string}` };
}

/** Papéis padrão da igreja de teste, por nome (a consulta também os garante). */
async function roleIds(app: HttpTestApp, auth: { Authorization: string }) {
  const response = await request(app.server).get('/roles').set(auth);
  return Object.fromEntries(
    (response.body as { id: string; name: string }[]).map((r) => [
      r.name,
      r.id,
    ]),
  ) as Record<'Administrador' | 'Dirigente' | 'Secretário', string>;
}

/** Administrador logado + os ids dos papéis, o ponto de partida de quase todo teste. */
async function asAdmin() {
  const app = await start();
  const auth = await authFor(app, TEST_ADMIN_EMAIL);
  return { app, auth, roles: await roleIds(app, auth) };
}

describe('GET /users', () => {
  it('o Administrador recebe os usuários da igreja no formato do contrato, sem dados secretos', async () => {
    const { app, auth } = await asAdmin();
    await app.addUser(1);

    const response = await request(app.server).get('/users').set(auth);

    expect(response.status).toBe(200);
    const users = (response.body as unknown[]).map((u) =>
      userSummarySchema.parse(u),
    );
    expect(users.map((u) => u.email)).toEqual([
      TEST_ADMIN_EMAIL,
      'usuario1@igreja.com',
    ]);
    expect(response.text).not.toMatch(/argon2|passwordHash|failedLogin/i);
  });

  it('exige login', async () => {
    const { app } = await asAdmin();

    expect((await request(app.server).get('/users')).status).toBe(401);
  });

  it('quem não tem access:manage-users recebe 403', async () => {
    const { app } = await asAdmin();
    const secretary = await app.addUser(2, {
      permissions: ['members:read', 'members:write'],
    });
    const auth = await authFor(app, secretary.email);

    const response = await request(app.server).get('/users').set(auth);

    expect(response.status).toBe(403);
  });

  it('não mostra usuários de outra igreja', async () => {
    const { app, auth } = await asAdmin();
    await app.addUser(3, { organizationId: OrganizationId.of(uuidFor(2)) });

    const response = await request(app.server).get('/users').set(auth);

    expect((response.body as UserSummary[]).map((u) => u.email)).toEqual([
      TEST_ADMIN_EMAIL,
    ]);
  });
});

describe('POST /users/:id/assignments', () => {
  it('atribui o papel e devolve o usuário atualizado; a mudança vale na hora', async () => {
    const { app, auth, roles } = await asAdmin();
    const target = await app.addUser(4);
    const targetAuth = await authFor(app, target.email);
    // /roles exige access:manage-users, que só o Administrador tem aqui.
    expect(
      (await request(app.server).get('/roles').set(targetAuth)).status,
    ).toBe(403);

    const response = await request(app.server)
      .post(`/users/${target.id}/assignments`)
      .set(auth)
      .send({ roleId: roles['Administrador'], congregationId: null });

    expect(response.status).toBe(200);
    expect(userSummarySchema.parse(response.body).roles).toEqual([
      {
        roleId: roles['Administrador'],
        roleName: 'Administrador',
        congregationId: null,
      },
    ]);
    // O MESMO token de antes passa a valer: as permissões são lidas do banco a cada requisição.
    expect(
      (await request(app.server).get('/roles').set(targetAuth)).status,
    ).toBe(200);
    expect(app.audit.entries.map((e) => e.action)).toContain(
      'user.role_assigned',
    );
  });

  it('atribuição repetida é 409', async () => {
    const { app, auth, roles } = await asAdmin();
    const target = await app.addUser(4);
    const body = { roleId: roles['Dirigente'], congregationId: CONGREGATION };
    await request(app.server)
      .post(`/users/${target.id}/assignments`)
      .set(auth)
      .send(body)
      .expect(200);

    const again = await request(app.server)
      .post(`/users/${target.id}/assignments`)
      .set(auth)
      .send(body);

    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      code: 'identity.role_already_assigned',
    });
  });

  it('o Administrador por congregação é 422', async () => {
    const { app, auth, roles } = await asAdmin();
    const target = await app.addUser(4);

    const response = await request(app.server)
      .post(`/users/${target.id}/assignments`)
      .set(auth)
      .send({ roleId: roles['Administrador'], congregationId: CONGREGATION });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      code: 'identity.administrator_scope_invalid',
    });
  });

  it('congregação inativa ou desconhecida é 422', async () => {
    const { app, auth, roles } = await asAdmin();
    const target = await app.addUser(4);

    for (const congregationId of [INACTIVE_CONGREGATION, uuidFor(1999)]) {
      const response = await request(app.server)
        .post(`/users/${target.id}/assignments`)
        .set(auth)
        .send({ roleId: roles['Secretário'], congregationId });
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({
        code: 'identity.congregation_unavailable',
      });
    }
  });

  it('papel desconhecido e usuário de outra igreja são 404', async () => {
    const { app, auth, roles } = await asAdmin();
    const foreign = await app.addUser(5, {
      organizationId: OrganizationId.of(uuidFor(2)),
    });

    const unknownRole = await request(app.server)
      .post(`/users/${uuidFor(500 + 1)}/assignments`)
      .set(auth)
      .send({ roleId: uuidFor(8888), congregationId: null });
    const foreignUser = await request(app.server)
      .post(`/users/${foreign.id}/assignments`)
      .set(auth)
      .send({ roleId: roles['Secretário'], congregationId: null });

    expect(unknownRole.status).toBe(404);
    expect(foreignUser.status).toBe(404);
    expect(foreignUser.body).toMatchObject({ code: 'identity.user_not_found' });
  });

  it('corpo malformado ou id fora do formato é 400', async () => {
    const { app, auth, roles } = await asAdmin();
    const target = await app.addUser(4);

    const noScope = await request(app.server)
      .post(`/users/${target.id}/assignments`)
      .set(auth)
      .send({ roleId: roles['Secretário'] });
    const badId = await request(app.server)
      .post('/users/nao-e-uuid/assignments')
      .set(auth)
      .send({ roleId: roles['Secretário'], congregationId: null });

    expect(noScope.status).toBe(400);
    expect(badId.status).toBe(400);
  });

  it('exige access:manage-users na igreja toda (um Dirigente de congregação não atribui papéis)', async () => {
    const { app, roles } = await asAdmin();
    const target = await app.addUser(4);
    const scoped = await app.addUser(6, {
      permissions: ['access:manage-users'],
      congregationId: CONGREGATION,
    });
    const auth = await authFor(app, scoped.email);

    const response = await request(app.server)
      .post(`/users/${target.id}/assignments`)
      .set(auth)
      .send({ roleId: roles['Secretário'], congregationId: null });

    expect(response.status).toBe(403);
  });
});

describe('POST /users/:id/assignments/revoke', () => {
  it('revoga a atribuição, devolve o usuário e audita', async () => {
    const { app, auth, roles } = await asAdmin();
    const target = await app.addUser(4);
    const body = { roleId: roles['Secretário'], congregationId: null };
    await request(app.server)
      .post(`/users/${target.id}/assignments`)
      .set(auth)
      .send(body)
      .expect(200);

    const response = await request(app.server)
      .post(`/users/${target.id}/assignments/revoke`)
      .set(auth)
      .send(body);

    expect(response.status).toBe(200);
    expect(userSummarySchema.parse(response.body).roles).toEqual([]);
    expect(app.audit.entries.map((e) => e.action)).toContain(
      'user.role_revoked',
    );
  });

  it('revogar o que não existe é 404', async () => {
    const { app, auth, roles } = await asAdmin();
    const target = await app.addUser(4);

    const response = await request(app.server)
      .post(`/users/${target.id}/assignments/revoke`)
      .set(auth)
      .send({ roleId: roles['Secretário'], congregationId: null });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: 'identity.assignment_not_found',
    });
  });

  it('tirar o Administrador do único administrador é 409 e nada muda', async () => {
    const { app, auth, roles } = await asAdmin();
    const me = (await request(app.server).get('/auth/me').set(auth)).body as {
      id: string;
    };

    const response = await request(app.server)
      .post(`/users/${me.id}/assignments/revoke`)
      .set(auth)
      .send({ roleId: roles['Administrador'], congregationId: null });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'identity.last_administrator',
    });
    expect((await request(app.server).get('/roles').set(auth)).status).toBe(
      200,
    );
  });
});

describe('POST /users/:id/disable e /enable', () => {
  it('desativar derruba o acesso na hora (o mesmo token deixa de valer) e reativar devolve', async () => {
    const { app, auth } = await asAdmin();
    const target = await app.addUser(4, { permissions: ['members:read'] });
    const targetAuth = await authFor(app, target.email);
    expect(
      (await request(app.server).get('/auth/me').set(targetAuth)).status,
    ).toBe(200);

    const disabled = await request(app.server)
      .post(`/users/${target.id}/disable`)
      .set(auth);

    expect(disabled.status).toBe(200);
    expect(userSummarySchema.parse(disabled.body).status).toBe('DISABLED');
    expect(
      (await request(app.server).get('/auth/me').set(targetAuth)).status,
    ).toBe(401);

    const enabled = await request(app.server)
      .post(`/users/${target.id}/enable`)
      .set(auth);
    expect(enabled.status).toBe(200);
    expect(userSummarySchema.parse(enabled.body).status).toBe('ACTIVE');
    expect(
      (await request(app.server).get('/auth/me').set(targetAuth)).status,
    ).toBe(200);
    expect(app.audit.entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(['user.disabled', 'user.enabled']),
    );
  });

  it('desativar o único administrador é 409', async () => {
    const { app, auth } = await asAdmin();
    const me = (await request(app.server).get('/auth/me').set(auth)).body as {
      id: string;
    };

    const response = await request(app.server)
      .post(`/users/${me.id}/disable`)
      .set(auth);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'identity.last_administrator',
    });
    expect((await request(app.server).get('/auth/me').set(auth)).status).toBe(
      200,
    );
  });

  it('usuário de outra igreja é 404', async () => {
    const { app, auth } = await asAdmin();
    const foreign = await app.addUser(5, {
      organizationId: OrganizationId.of(uuidFor(2)),
    });

    expect(
      (await request(app.server).post(`/users/${foreign.id}/disable`).set(auth))
        .status,
    ).toBe(404);
    expect(
      (await request(app.server).post(`/users/${foreign.id}/enable`).set(auth))
        .status,
    ).toBe(404);
  });

  it.each(['disable', 'enable'])(
    'POST /users/:id/%s exige login e a permissão',
    async (action) => {
      const { app } = await asAdmin();
      const target = await app.addUser(4);
      const secretary = await app.addUser(6, { permissions: ['members:read'] });
      const secretaryAuth = await authFor(app, secretary.email);

      const anonymous = await request(app.server).post(
        `/users/${target.id}/${action}`,
      );
      const forbidden = await request(app.server)
        .post(`/users/${target.id}/${action}`)
        .set(secretaryAuth);

      expect(anonymous.status).toBe(401);
      expect(forbidden.status).toBe(403);
    },
  );
});

/** Cria um usuário pela API e devolve a resposta (já com a senha temporária). */
async function createUser(
  app: HttpTestApp,
  auth: { Authorization: string },
  body: { email: string; roleId: string; congregationId: string | null },
) {
  return request(app.server).post('/users').set(auth).send(body);
}

async function loginWith(app: HttpTestApp, email: string, password: string) {
  return request(app.server).post('/auth/login').send({ email, password });
}

/** O cookie de renovação (`refresh_token=...`) que a resposta de login entregou. */
function refreshCookieOf(response: request.Response): string {
  return ([response.headers['set-cookie']].flat() as string[])
    .join('; ')
    .split(';')[0] as string;
}

describe('POST /users (criar com senha temporária, ADR 0014)', () => {
  it('cria o usuário (201), devolve a senha temporária uma vez e proíbe cache da resposta', async () => {
    const { app, auth, roles } = await asAdmin();

    const response = await createUser(app, auth, {
      email: 'Maria@Igreja.com',
      roleId: roles['Secretário'],
      congregationId: null,
    });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = temporaryPasswordResponseSchema.parse(response.body);
    expect(body.user.email).toBe('maria@igreja.com');
    expect(body.user.roles[0]?.roleName).toBe('Secretário');
    expect(body.temporaryPassword).toMatch(/^\S{4}-\S{4}-\S{4}-\S{4}$/);
  });

  it('a senha temporária entra, o login avisa da troca e a API só atende /auth/* até trocar', async () => {
    const { app, auth, roles } = await asAdmin();
    const created = await createUser(app, auth, {
      email: 'nova@igreja.com',
      roleId: roles['Administrador'],
      congregationId: null,
    });
    const temp = created.body.temporaryPassword as string;

    const login = await loginWith(app, 'nova@igreja.com', temp);
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const pending = {
      Authorization: `Bearer ${login.body.accessToken as string}`,
    };

    // Mesmo sendo Administrador, nada de negócio até trocar a senha.
    for (const path of ['/roles', '/users']) {
      const blocked = await request(app.server).get(path).set(pending);
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject({
        code: 'identity.password_change_required',
      });
    }
    const me = await request(app.server).get('/auth/me').set(pending);
    expect(me.status).toBe(200);
    expect(me.body.mustChangePassword).toBe(true);
  });

  it('trocar a própria senha libera o MESMO token na hora', async () => {
    const { app, auth, roles } = await asAdmin();
    const created = await createUser(app, auth, {
      email: 'nova@igreja.com',
      roleId: roles['Administrador'],
      congregationId: null,
    });
    const login = await loginWith(
      app,
      'nova@igreja.com',
      created.body.temporaryPassword as string,
    );
    const pending = {
      Authorization: `Bearer ${login.body.accessToken as string}`,
    };

    const changed = await request(app.server)
      .post('/auth/change-password')
      .set(pending)
      .send({
        currentPassword: created.body.temporaryPassword,
        newPassword: 'minha-senha-nova-bem-forte-1',
      });

    expect(changed.status).toBe(204);
    expect((await request(app.server).get('/roles').set(pending)).status).toBe(
      200,
    );
    const me = await request(app.server).get('/auth/me').set(pending);
    expect(me.body.mustChangePassword).toBe(false);
  });

  it('com a troca pendente, renovar a sessão e sair continuam funcionando', async () => {
    const { app, auth, roles } = await asAdmin();
    const created = await createUser(app, auth, {
      email: 'nova@igreja.com',
      roleId: roles['Secretário'],
      congregationId: null,
    });
    const login = await loginWith(
      app,
      'nova@igreja.com',
      created.body.temporaryPassword as string,
    );
    const cookie = refreshCookieOf(login);

    const refreshed = await request(app.server)
      .post('/auth/refresh')
      .set('Cookie', cookie);
    const loggedOut = await request(app.server)
      .post('/auth/logout')
      .set('Cookie', refreshCookieOf(refreshed));

    expect(refreshed.status).toBe(200);
    expect(loggedOut.status).toBe(204);
  });

  it('a pendência vem ANTES da checagem de permissão: o código é o da troca, não o de permissão negada', async () => {
    const { app, auth, roles } = await asAdmin();
    const created = await createUser(app, auth, {
      email: 'nova@igreja.com',
      roleId: roles['Secretário'],
      congregationId: null,
    });
    const login = await loginWith(
      app,
      'nova@igreja.com',
      created.body.temporaryPassword as string,
    );

    const response = await request(app.server)
      .get('/users')
      .set({ Authorization: `Bearer ${login.body.accessToken as string}` });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'identity.password_change_required',
    });
  });

  it('e-mail já cadastrado é 409; entrada malformada é 400; regra de atribuição é 422', async () => {
    const { app, auth, roles } = await asAdmin();
    const ok = { roleId: roles['Secretário'], congregationId: null };

    const duplicate = await createUser(app, auth, {
      email: TEST_ADMIN_EMAIL,
      ...ok,
    });
    const malformed = await request(app.server)
      .post('/users')
      .set(auth)
      .send({ email: 'x@y.com' });
    const adminByCongregation = await createUser(app, auth, {
      email: 'a@igreja.com',
      roleId: roles['Administrador'],
      congregationId: CONGREGATION,
    });
    const invalidEmail = await createUser(app, auth, {
      email: 'isto-nao-e-email',
      ...ok,
    });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: 'identity.email_already_registered',
    });
    expect(malformed.status).toBe(400);
    expect(adminByCongregation.status).toBe(422);
    expect(invalidEmail.status).toBe(422);
  });

  it('exige login e access:manage-users na igreja toda', async () => {
    const { app, roles } = await asAdmin();
    const secretary = await app.addUser(6, { permissions: ['members:read'] });
    const secretaryAuth = await authFor(app, secretary.email);
    const body = {
      email: 'a@igreja.com',
      roleId: roles['Secretário'],
      congregationId: null,
    };

    const anonymous = await request(app.server).post('/users').send(body);
    const forbidden = await request(app.server)
      .post('/users')
      .set(secretaryAuth)
      .send(body);

    expect(anonymous.status).toBe(401);
    expect(forbidden.status).toBe(403);
  });

  it('audita a criação sem senha e sem e-mail', async () => {
    const { app, auth, roles } = await asAdmin();

    const response = await createUser(app, auth, {
      email: 'nova@igreja.com',
      roleId: roles['Secretário'],
      congregationId: null,
    });

    expect(app.audit.entries.map((e) => e.action)).toContain('user.created');
    const trail = JSON.stringify(app.audit.entries);
    expect(trail).not.toContain(response.body.temporaryPassword as string);
    expect(trail).not.toContain('nova@igreja.com');
  });
});

describe('POST /users/:id/reset-password', () => {
  it('gera outra senha temporária, derruba as sessões e volta a exigir a troca', async () => {
    const { app, auth } = await asAdmin();
    const target = await app.addUser(4);
    const old = await loginWith(app, target.email, TEST_PASSWORD);
    expect(old.status).toBe(200);

    const reset = await request(app.server)
      .post(`/users/${target.id}/reset-password`)
      .set(auth);

    expect(reset.status).toBe(200);
    expect(reset.headers['cache-control']).toBe('no-store');
    const body = temporaryPasswordResponseSchema.parse(reset.body);
    expect((await loginWith(app, target.email, TEST_PASSWORD)).status).toBe(
      401,
    );
    const fresh = await loginWith(app, target.email, body.temporaryPassword);
    expect(fresh.status).toBe(200);
    expect(fresh.body.user.mustChangePassword).toBe(true);
    // A renovação da sessão antiga morreu junto com as sessões.
    expect(
      (
        await request(app.server)
          .post('/auth/refresh')
          .set('Cookie', refreshCookieOf(old))
      ).status,
    ).toBe(401);
    expect(app.audit.entries.map((e) => e.action)).toContain(
      'user.password_reset',
    );
  });

  it('id fora do formato é 400', async () => {
    const { app, auth } = await asAdmin();

    const response = await request(app.server)
      .post('/users/nao-e-uuid/reset-password')
      .set(auth);

    expect(response.status).toBe(400);
  });

  it('usuário de outra igreja é 404; sem permissão é 403; sem login é 401', async () => {
    const { app, auth } = await asAdmin();
    const foreign = await app.addUser(5, {
      organizationId: OrganizationId.of(uuidFor(2)),
    });
    const target = await app.addUser(4);
    const plain = await app.addUser(6, { permissions: ['members:read'] });
    const plainAuth = await authFor(app, plain.email);

    expect(
      (
        await request(app.server)
          .post(`/users/${foreign.id}/reset-password`)
          .set(auth)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app.server)
          .post(`/users/${target.id}/reset-password`)
          .set(plainAuth)
      ).status,
    ).toBe(403);
    expect(
      (await request(app.server).post(`/users/${target.id}/reset-password`))
        .status,
    ).toBe(401);
  });
});
