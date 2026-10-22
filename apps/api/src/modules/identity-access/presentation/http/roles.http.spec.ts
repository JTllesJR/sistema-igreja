import { roleSchema } from '@igreja/contracts';
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

function CongregationIdFor(n: number) {
  return uuidFor(1000 + n) as never;
}
