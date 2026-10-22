import { auditPageSchema } from '@igreja/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type HttpTestApp,
  startHttpTestApp,
  TEST_ADMIN_EMAIL,
  TEST_ORGANIZATION,
  TEST_PASSWORD,
} from '../../../identity-access/presentation/http/testing/http-test-app.js';
import { AuditTrailModule } from '../../trail.js';
import { AUDIT_QUERY_REPOSITORY } from '../../audit.tokens.js';
import {
  actor,
  aRecord,
  entityOf,
  recordId,
} from '../../domain/testing/audit-query.contract.js';
import { InMemoryAuditQueryRepository } from '../../domain/testing/in-memory-audit-query.repository.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

const hour = (h: number) =>
  `2026-10-20T${String(h).padStart(2, '0')}:00:00.000Z`;

/** A aplicação inteira com a consulta em memória. A igreja do teste tem 3 registros; a OUTRA igreja tem 1. */
async function start() {
  const repository = new InMemoryAuditQueryRepository();
  repository.seed(
    aRecord(1, {
      organizationId: TEST_ORGANIZATION,
      at: hour(10),
      actorId: actor(1),
      metadata: { returned: 2 },
    }),
    aRecord(2, {
      organizationId: TEST_ORGANIZATION,
      at: hour(11),
      actorId: actor(2),
      action: 'finance.entry_approved',
      entity: 'financial_entry',
      entityId: entityOf(2),
    }),
    aRecord(3, {
      organizationId: TEST_ORGANIZATION,
      at: hour(12),
      actorId: actor(2),
      action: 'finance.income_recorded',
      entity: 'financial_entry',
      entityId: entityOf(3),
    }),
    aRecord(4, { organizationId: uuidFor(2) as never, at: hour(13) }),
  );
  const app = await startHttpTestApp({
    imports: [AuditTrailModule],
    overrides: (builder) =>
      builder.overrideProvider(AUDIT_QUERY_REPOSITORY).useValue(repository),
  });
  running.push(app);
  return app;
}

async function login(app: HttpTestApp, email: string) {
  const response = await request(app.server)
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return { Authorization: `Bearer ${response.body.accessToken as string}` };
}

async function users(app: HttpTestApp) {
  const make = async (
    n: number,
    permissions: string[],
    congregationId?: ReturnType<typeof uuidFor>,
  ) =>
    login(
      app,
      (
        await app.addUser(n, {
          permissions,
          ...(congregationId
            ? { congregationId: congregationId as never }
            : {}),
        })
      ).email,
    );
  return {
    admin: await login(app, TEST_ADMIN_EMAIL),
    board: await make(1, ['audit:read']),
    // `audit:read` só numa congregação: a trilha é da igreja toda, então NÃO vale.
    scoped: await make(2, ['audit:read'], uuidFor(1001)),
    others: await make(3, ['members:read', 'finance:read', 'finance:approve']),
    nobody: await login(app, (await app.addUser(4)).email),
  };
}

const get = (app: HttpTestApp, auth: { Authorization: string }, query = '') =>
  request(app.server).get(`/audit${query}`).set(auth);

describe('GET /audit', () => {
  it('sem login: 401', async () => {
    const app = await start();

    expect((await request(app.server).get('/audit')).status).toBe(401);
  });

  it('só a igreja toda com audit:read: o Administrador e a Diretoria entram; os demais, 403', async () => {
    const app = await start();
    const u = await users(app);

    expect((await get(app, u.admin)).status).toBe(200);
    expect((await get(app, u.board)).status).toBe(200);
    for (const denied of [u.scoped, u.others, u.nobody]) {
      const response = await get(app, denied);
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('identity.permission_denied');
    }
  });

  it('devolve SÓ a trilha da igreja do token, no formato do contrato, do mais recente ao mais antigo', async () => {
    const app = await start();
    const u = await users(app);

    const response = await get(app, u.board);

    const page = auditPageSchema.parse(response.body);
    const mine = page.items
      .filter((i) => i.action !== 'audit.queried')
      .map((i) => i.id);
    expect(mine).toEqual([recordId(3), recordId(2), recordId(1)]);
    expect(page.items.some((i) => i.id === recordId(4))).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it('filtra e pagina por cursor, percorrendo tudo sem repetir', async () => {
    const app = await start();
    const u = await users(app);

    const finance = auditPageSchema.parse(
      (await get(app, u.board, '?module=finance')).body,
    );
    const byActor = auditPageSchema.parse(
      (await get(app, u.board, `?actorId=${actor(2)}`)).body,
    );
    expect(finance.items.map((i) => i.id)).toEqual([recordId(3), recordId(2)]);
    expect(byActor.items.map((i) => i.id)).toEqual([recordId(3), recordId(2)]);

    const first = auditPageSchema.parse(
      (await get(app, u.board, '?limit=1&entity=financial_entry')).body,
    );
    expect(first.items.map((i) => i.id)).toEqual([recordId(3)]);
    expect(first.nextCursor).not.toBeNull();
    const second = auditPageSchema.parse(
      (
        await get(
          app,
          u.board,
          `?limit=1&entity=financial_entry&cursor=${first.nextCursor}`,
        )
      ).body,
    );
    expect(second.items.map((i) => i.id)).toEqual([recordId(2)]);
    expect(second.nextCursor).toBeNull();
  });

  it('a consulta fica registrada na trilha: quem consultou e só os NOMES dos filtros', async () => {
    const app = await start();
    const u = await users(app);
    app.audit.entries.length = 0;

    await get(app, u.board, `?entityId=${entityOf(2)}&module=finance`);

    expect(app.audit.entries).toEqual([
      expect.objectContaining({
        action: 'audit.queried',
        entity: 'audit_log',
        metadata: { returned: 1, filters: 'entityId,module', paged: false },
      }),
    ]);
    expect(JSON.stringify(app.audit.entries)).not.toContain(entityOf(2));
  });

  it('FALHA FECHADA: sem registrar a consulta, nada é devolvido (500, sem corpo da trilha)', async () => {
    const app = await start();
    const u = await users(app);
    app.audit.failWith = new Error('trilha fora do ar');

    const response = await get(app, u.board);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain(recordId(1));
  });

  it('entrada malformada: 400 no formato (limite, ids, módulo, data) e 422 na regra (cursor, período invertido)', async () => {
    const app = await start();
    const u = await users(app);

    for (const query of [
      '?limit=0',
      '?limit=101',
      '?actorId=maria',
      '?module=Fin%25',
      '?from=ontem',
    ]) {
      expect((await get(app, u.board, query)).status, query).toBe(400);
    }
    for (const query of [
      '?cursor=lixo',
      '?from=2026-10-20T12:00:00Z&to=2026-10-20T10:00:00Z',
    ]) {
      expect((await get(app, u.board, query)).status, query).toBe(422);
    }
  });
});
