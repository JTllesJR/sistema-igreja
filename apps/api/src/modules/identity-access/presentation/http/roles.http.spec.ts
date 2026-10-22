import { permissionDefinitionSchema, roleSchema } from '@igreja/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
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

async function start() {
  const app = await startHttpTestApp();
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

describe('GET /roles', () => {
  it('o Administrador recebe os papéis da igreja no formato do contrato', async () => {
    const app = await start();
    const auth = await authFor(app, TEST_ADMIN_EMAIL);

    const response = await request(app.server).get('/roles').set(auth);

    expect(response.status).toBe(200);
    const roles = (response.body as unknown[]).map((r) => roleSchema.parse(r));
    expect(roles.map((r) => r.name)).toEqual([
      'Administrador',
      'Diretoria',
      'Dirigente',
      'Secretário',
      'Tesoureiro',
    ]);
    expect(roles.find((r) => r.name === 'Secretário')?.permissions).toEqual([
      'members:read',
      'members:write',
      'organization:read',
    ]);
  });

  it('exige login', async () => {
    const app = await start();

    const response = await request(app.server).get('/roles');

    expect(response.status).toBe(401);
  });

  it('quem não tem access:manage-users recebe 403, mesmo sendo secretário de uma congregação', async () => {
    const app = await start();
    const secretary = await app.addUser(1, {
      permissions: ['members:read', 'members:write', 'organization:read'],
    });

    const auth = await authFor(app, secretary.email);

    const response = await request(app.server).get('/roles').set(auth);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'identity.permission_denied' });
  });

  it('access:manage-users só vale para a igreja toda: com escopo de uma congregação é 403', async () => {
    const app = await start();
    const scoped = await app.addUser(2, {
      permissions: ['access:manage-users'],
      congregationId: CongregationIdFor(5),
    });

    const auth = await authFor(app, scoped.email);

    const response = await request(app.server).get('/roles').set(auth);

    expect(response.status).toBe(403);
  });

  it('quem tem access:manage-users na igreja toda consegue, sem precisar ser Administrador', async () => {
    const app = await start();
    const manager = await app.addUser(3, {
      permissions: ['access:manage-users'],
    });

    const auth = await authFor(app, manager.email);

    const response = await request(app.server).get('/roles').set(auth);

    expect(response.status).toBe(200);
  });
});

describe('editor de papéis (UC-02, ADR 0019)', () => {
  async function asAdmin() {
    const app = await start();
    return { app, auth: await authFor(app, TEST_ADMIN_EMAIL) };
  }

  it('GET /roles/permissions lista o catálogo real, sem o que é reservado ao Administrador', async () => {
    const { app, auth } = await asAdmin();

    const response = await request(app.server)
      .get('/roles/permissions')
      .set(auth);

    expect(response.status).toBe(200);
    const keys = (response.body as unknown[]).map(
      (p) => permissionDefinitionSchema.parse(p).key,
    );
    expect(keys).toContain('members:read');
    expect(keys).toContain('finance:approve');
    expect(keys).toContain('audit:read');
    expect(keys).not.toContain('access:manage-users');
    expect(keys).not.toContain('*');
  });

  it('cria (201), edita (200) e exclui (204) um papel personalizado, que aparece e some da lista', async () => {
    const { app, auth } = await asAdmin();

    const created = await request(app.server)
      .post('/roles')
      .set(auth)
      .send({
        name: 'Secretário de Missões',
        permissions: ['members:read', 'organization:read'],
      });
    expect(created.status).toBe(201);
    const role = roleSchema.parse(created.body);
    expect(role).toMatchObject({
      isSystem: false,
      name: 'Secretário de Missões',
    });

    const edited = await request(app.server)
      .patch(`/roles/${role.id}`)
      .set(auth)
      .send({ permissions: ['members:read', 'members:write'] });
    expect(edited.status).toBe(200);
    expect(edited.body.permissions).toEqual(['members:read', 'members:write']);

    await request(app.server).delete(`/roles/${role.id}`).set(auth).expect(204);
    const list = await request(app.server).get('/roles').set(auth);
    expect((list.body as { name: string }[]).map((r) => r.name)).not.toContain(
      'Secretário de Missões',
    );
  });

  it('permissão fora do catálogo ou reservada: 422; nome repetido: 409', async () => {
    const { app, auth } = await asAdmin();
    const post = (body: object) =>
      request(app.server).post('/roles').set(auth).send(body);

    expect(
      (await post({ name: 'Ajudante', permissions: ['members:raed'] })).status,
    ).toBe(422);
    expect(
      (await post({ name: 'Ajudante', permissions: ['access:manage-users'] }))
        .status,
    ).toBe(422);
    expect(
      (await post({ name: 'Ajudante', permissions: ['members:read'] })).status,
    ).toBe(201);
    expect(
      (await post({ name: 'AJUDANTE', permissions: ['members:read'] })).body,
    ).toMatchObject({ code: 'identity.role_name_taken' });
  });

  it('papel padrão não se edita nem se exclui (409); papel atribuído não se exclui (409)', async () => {
    const { app, auth } = await asAdmin();
    const roles = (await request(app.server).get('/roles').set(auth)).body as {
      id: string;
      name: string;
    }[];
    const secretary = roles.find((r) => r.name === 'Secretário')!;

    const patched = await request(app.server)
      .patch(`/roles/${secretary.id}`)
      .set(auth)
      .send({ name: 'Outro' });
    expect(patched.status).toBe(409);
    expect(patched.body).toMatchObject({
      code: 'identity.system_role_immutable',
    });

    const created = await request(app.server)
      .post('/roles')
      .set(auth)
      .send({ name: 'Louvor', permissions: ['organization:read'] });
    const user = await app.addUser(7);
    await request(app.server)
      .post(`/users/${user.id}/assignments`)
      .set(auth)
      .send({ roleId: created.body.id, congregationId: null })
      .expect(200);

    const deleted = await request(app.server)
      .delete(`/roles/${created.body.id as string}`)
      .set(auth);
    expect(deleted.status).toBe(409);
    expect(deleted.body).toMatchObject({ code: 'identity.role_in_use' });
  });

  it('só quem gere acessos na igreja toda usa o editor (403); id malformado é 400', async () => {
    const { app, auth } = await asAdmin();
    const secretary = await app.addUser(8, {
      permissions: ['members:read', 'organization:read'],
    });
    const other = await authFor(app, secretary.email);

    for (const [method, path] of [
      ['get', '/roles/permissions'],
      ['post', '/roles'],
      ['patch', `/roles/${uuidFor(5)}`],
      ['delete', `/roles/${uuidFor(5)}`],
    ] as const) {
      const response = await request(app.server)[method](path).set(other);
      expect(response.status, `${method} ${path}`).toBe(403);
    }
    expect(
      (await request(app.server).delete('/roles/nao-e-uuid').set(auth)).status,
    ).toBe(400);
  });
});

function CongregationIdFor(n: number) {
  return uuidFor(1000 + n) as never;
}
