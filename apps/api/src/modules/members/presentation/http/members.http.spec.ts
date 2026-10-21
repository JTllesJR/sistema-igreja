import {
  memberDetailSchema,
  memberListResponseSchema,
} from '@igreja/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLog } from '../../../../shared/testing/in-memory-audit-log.js';
import { AUDIT_LOG } from '../../../audit/index.js';
import {
  type HttpTestApp,
  startHttpTestApp,
  TEST_ADMIN_EMAIL,
  TEST_PASSWORD,
} from '../../../identity-access/presentation/http/testing/http-test-app.js';
import { FakeCongregationDirectory } from '../../application/testing/test-bed.js';
import { InMemoryMemberRepository } from '../../domain/testing/in-memory-member.repository.js';
import {
  aMember,
  congId,
  memberId,
  orgId,
} from '../../domain/testing/fixtures.js';
import {
  CLOCK,
  CONGREGATION_DIRECTORY,
  MEMBER_REPOSITORY,
} from '../../members.tokens.js';
import { MembersModule } from '../../members.module.js';

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

const C1 = congId(1);
const C2 = congId(2);

/**
 * A aplicação HTTP inteira com repositório, diretório de congregações e trilha em memória. A igreja 1 (a do teste) tem as
 * congregações 1, 2 e 3 e a 4 desativada; a igreja 2 tem a 10 e UM membro, que nenhum usuário da igreja 1 pode alcançar.
 */
async function start() {
  const repository = new InMemoryMemberRepository();
  const audit = new InMemoryAuditLog();
  const directory = new FakeCongregationDirectory();
  for (const n of [1, 2, 3]) directory.set(orgId(1), congId(n));
  directory.set(orgId(1), congId(4), 'INACTIVE');
  directory.set(orgId(2), congId(10));

  await repository.add(
    aMember(900, {
      organization: 2,
      congregation: 10,
      name: 'Maria de Outra Igreja',
    }),
  );

  const app = await startHttpTestApp({
    imports: [MembersModule],
    overrides: (builder, { clock }) =>
      builder
        .overrideProvider(MEMBER_REPOSITORY)
        .useValue(repository)
        .overrideProvider(CONGREGATION_DIRECTORY)
        .useValue(directory)
        .overrideProvider(AUDIT_LOG)
        .useValue(audit)
        .overrideProvider(CLOCK)
        .useValue(clock),
  });
  running.push(app);

  return { app, repository, audit, foreignId: memberId(900) as string };
}

type Started = Awaited<ReturnType<typeof start>>;

async function login(app: HttpTestApp, email: string) {
  const response = await request(app.server)
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return { Authorization: `Bearer ${response.body.accessToken as string}` };
}

/** Os perfis de teste. A senha de todos é a do `TEST_PASSWORD`. */
async function users(app: HttpTestApp) {
  const secretary1 = await app.addUser(1, {
    permissions: ['members:read', 'members:write'],
    congregationId: C1,
  });
  const reader1 = await app.addUser(2, {
    permissions: ['members:read'],
    congregationId: C1,
  });
  const readerAll = await app.addUser(3, { permissions: ['members:read'] });
  const writerNoRead = await app.addUser(4, {
    permissions: ['members:write'],
    congregationId: C1,
  });
  const nobody = await app.addUser(5);
  const director = await app.addUser(6, {
    permissions: ['members:read', 'members:write'],
  });
  return {
    admin: await login(app, TEST_ADMIN_EMAIL),
    secretary1: await login(app, secretary1.email),
    reader1: await login(app, reader1.email),
    readerAll: await login(app, readerAll.email),
    writerNoRead: await login(app, writerNoRead.email),
    nobody: await login(app, nobody.email),
    director: await login(app, director.email),
  };
}

const maria = {
  fullName: 'Maria da Silva',
  birthDate: '1990-05-10',
  phone: '(81) 99999-8888',
  email: 'maria@exemplo.com',
  address: {
    street: 'Rua das Flores',
    number: '100',
    city: 'Recife',
    state: 'PE',
  },
};

async function create(
  { app }: Started,
  auth: { Authorization: string },
  body: object = {},
  congregationId: string = C1,
) {
  const response = await request(app.server)
    .post('/members')
    .set(auth)
    .send({ congregationId, fullName: 'Maria da Silva', ...body });
  return response;
}

describe('autenticação e permissão de entrada', () => {
  it('sem login: 401 em todas as rotas', async () => {
    const { app, foreignId } = await start();

    for (const [method, path] of [
      ['get', '/members'],
      ['post', '/members'],
      ['get', `/members/${foreignId}`],
      ['patch', `/members/${foreignId}`],
      ['post', `/members/${foreignId}/status`],
      ['post', `/members/${foreignId}/transfer`],
      ['post', `/members/${foreignId}/history`],
      ['post', `/members/${foreignId}/anonymize`],
    ] as const) {
      const response = await request(app.server)[method](path);
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('sem a permissão certa: 403 (ler exige members:read; escrever, members:write)', async () => {
    const started = await start();
    const u = await users(started.app);
    const { app } = started;

    expect(
      (await request(app.server).get('/members').set(u.nobody)).status,
    ).toBe(403);
    expect(
      (await request(app.server).get('/members').set(u.writerNoRead)).status,
    ).toBe(403);
    expect((await create(started, u.reader1)).status).toBe(403);
    expect((await create(started, u.nobody)).status).toBe(403);
  });
});

describe('POST /members (cadastro)', () => {
  it('cadastra (201), devolve só o id e a ficha segue o contrato', async () => {
    const started = await start();
    const { admin } = await users(started.app);

    const created = await create(started, admin, maria);
    expect(created.status).toBe(201);
    expect(Object.keys(created.body)).toEqual(['id']);

    const detail = await request(started.app.server)
      .get(`/members/${created.body.id}`)
      .set(admin);
    expect(detail.status).toBe(200);
    const parsed = memberDetailSchema.parse(detail.body);
    expect(parsed).toMatchObject({
      fullName: 'Maria da Silva',
      congregationId: C1,
      status: 'ACTIVE',
      birthDate: '1990-05-10',
      phone: '81999998888',
      email: 'maria@exemplo.com',
      anonymized: false,
      capabilities: { canEdit: true, canAnonymize: true },
    });
    expect(parsed.history.map((e) => e.type)).toEqual(['REGISTERED']);
  });

  it('a igreja vem do TOKEN: o que o cliente manda sobre igreja, versão ou anonimização é ignorado', async () => {
    const started = await start();
    const { admin } = await users(started.app);

    const created = await create(started, admin, {
      organizationId: orgId(2),
      version: 99,
      anonymizedAt: '2020-01-01',
    });

    expect(created.status).toBe(201);
    const stored = await started.repository.findById(orgId(1), created.body.id);
    expect(stored).toMatchObject({
      organizationId: orgId(1),
      version: 0,
      anonymizedAt: null,
    });
  });

  it('escrita por congregação: secretária da 1 cadastra na 1, mas não na 2 (403)', async () => {
    const started = await start();
    const { secretary1 } = await users(started.app);

    expect((await create(started, secretary1, {}, C1)).status).toBe(201);
    const outside = await create(started, secretary1, {}, C2);

    expect(outside.status).toBe(403);
    expect(outside.body.code).toBe('members.access_denied');
  });

  it.each([
    ['desativada', congId(4)],
    ['inexistente', congId(999)],
    ['de OUTRA igreja', congId(10)],
  ])('congregação %s: 422', async (_nome, congregationId) => {
    const started = await start();
    const { admin } = await users(started.app);

    const response = await create(started, admin, {}, congregationId);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('members.congregation_unavailable');
  });

  it('corpo malformado: 400 apontando o campo, sem repetir o valor enviado', async () => {
    const started = await start();
    const { admin } = await users(started.app);

    const response = await create(started, admin, {
      status: 'EM_DISCIPLINA',
      phone: 12345,
    });

    expect(response.status).toBe(400);
    expect(
      response.body.errors.map((e: { path: string }) => e.path).sort(),
    ).toEqual(['phone', 'status']);
    expect(response.text).not.toContain('12345');
  });

  it('regra de domínio: telefone, nascimento no futuro e UF inexistente dão 422 e não gravam nada', async () => {
    const started = await start();
    const { admin } = await users(started.app);

    for (const body of [
      { phone: '123' },
      { birthDate: '2999-01-01' },
      { address: { street: 'Rua A', city: 'X', state: 'ZZ' } },
    ]) {
      const response = await create(started, admin, body);
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('validation.invalid_value');
    }
    const list = await request(started.app.server).get('/members').set(admin);
    expect(list.body.total).toBe(0);
  });
});

describe('GET /members (lista e busca)', () => {
  async function populated() {
    const started = await start();
    const u = await users(started.app);
    for (const [name, congregation] of [
      ['Ana Souza', C1],
      ['Álvaro Lima', C1],
      ['José Conceição', C2],
      ['Bruna Alves', congId(3)],
    ] as const) {
      await create(
        started,
        u.admin,
        { ...maria, fullName: name },
        congregation,
      );
    }
    return { started, u };
  }
  const names = (body: { items: { fullName: string }[] }) =>
    body.items.map((i) => i.fullName);

  it('lista a igreja toda para quem a enxerga toda; nunca mostra a outra igreja', async () => {
    const { started, u } = await populated();

    const response = await request(started.app.server)
      .get('/members')
      .set(u.readerAll);

    expect(response.status).toBe(200);
    const body = memberListResponseSchema.parse(response.body);
    expect(names(body)).toEqual([
      'Álvaro Lima',
      'Ana Souza',
      'Bruna Alves',
      'José Conceição',
    ]);
    expect(body).toMatchObject({ total: 4, limit: 20, offset: 0 });
    expect(response.text).not.toContain('Outra Igreja');
  });

  it('ESCOPO: a secretária da congregação 1 só enxerga a 1', async () => {
    const { started, u } = await populated();

    const response = await request(started.app.server)
      .get('/members')
      .set(u.secretary1);

    expect(names(response.body)).toEqual(['Álvaro Lima', 'Ana Souza']);
    expect(response.body.total).toBe(2);
  });

  it('pedir uma congregação fora do escopo devolve vazio, nunca amplia', async () => {
    const { started, u } = await populated();

    const response = await request(started.app.server)
      .get('/members')
      .query({ congregationId: C2 })
      .set(u.secretary1);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
  });

  it('a lista traz só o mínimo: sem telefone, e-mail, nascimento nem endereço', async () => {
    const { started, u } = await populated();

    const response = await request(started.app.server)
      .get('/members')
      .set(u.admin);

    for (const item of response.body.items) {
      expect(Object.keys(item).sort()).toEqual([
        'congregationId',
        'fullName',
        'id',
        'status',
      ]);
    }
    expect(response.text).not.toMatch(/99999|exemplo|1990|Flores/);
  });

  it('busca sem diferenciar acento, filtra por situação e pagina', async () => {
    const { started, u } = await populated();
    const get = (query: object) =>
      request(started.app.server).get('/members').query(query).set(u.admin);

    expect(names((await get({ search: 'jose' })).body)).toEqual([
      'José Conceição',
    ]);
    expect(names((await get({ limit: 2, offset: 1 })).body)).toEqual([
      'Ana Souza',
      'Bruna Alves',
    ]);
    expect((await get({ status: 'AWAY' })).body.total).toBe(0);
  });

  it.each([
    ['limite acima do máximo', { limit: 101 }],
    ['limite zero', { limit: 0 }],
    ['posição negativa', { offset: -1 }],
    ['situação inexistente', { status: 'X' }],
    ['congregação que não é UUID', { congregationId: 'x' }],
  ])('recusa %s com 400', async (_nome, query) => {
    const { started, u } = await populated();

    const response = await request(started.app.server)
      .get('/members')
      .query(query)
      .set(u.admin);

    expect(response.status).toBe(400);
  });
});

describe('GET /members/:id (ficha: leitura auditada)', () => {
  it('membro fora do escopo, inexistente e de OUTRA igreja respondem 404 IDÊNTICOS', async () => {
    const started = await start();
    const u = await users(started.app);
    const inC2 = (await create(started, u.admin, {}, C2)).body.id as string;
    const missing = '0199c0a4-7b3e-7c11-8f2a-00000000dead';

    const responses = [
      await request(started.app.server)
        .get(`/members/${inC2}`)
        .set(u.secretary1),
      await request(started.app.server)
        .get(`/members/${started.foreignId}`)
        .set(u.admin),
      await request(started.app.server).get(`/members/${missing}`).set(u.admin),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('members.not_found');
    }
    expect(new Set(responses.map((r) => r.body.detail)).size).toBe(1);
  });

  it('id mal formado na URL: 400', async () => {
    const started = await start();
    const { admin } = await users(started.app);

    expect(
      (await request(started.app.server).get('/members/abc').set(admin)).status,
    ).toBe(400);
  });

  it('as capacidades dependem de quem pergunta', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;
    const get = async (auth: { Authorization: string }) =>
      (await request(started.app.server).get(`/members/${id}`).set(auth)).body
        .capabilities;

    expect(await get(u.admin)).toEqual({ canEdit: true, canAnonymize: true });
    expect(await get(u.secretary1)).toEqual({
      canEdit: true,
      canAnonymize: false,
    });
    expect(await get(u.reader1)).toEqual({
      canEdit: false,
      canAnonymize: false,
    });
  });

  it('REGISTRA quem viu a ficha, sem nenhum dado pessoal na trilha', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;
    started.audit.entries.length = 0;

    await request(started.app.server).get(`/members/${id}`).set(u.secretary1);
    await request(started.app.server).get('/members').set(u.secretary1);

    expect(started.audit.entries.map((e) => [e.action, e.entityId])).toEqual([
      ['member.viewed', id],
      ['member.listed', null],
    ]);
    expect(JSON.stringify(started.audit.entries)).not.toMatch(
      /Maria|99999|exemplo|Flores/,
    );
  });

  it('FALHA FECHADA: se a trilha não grava, a ficha e a lista NÃO saem (500 sem dado pessoal)', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;
    started.audit.failWith = new Error('trilha fora do ar');

    const detail = await request(started.app.server)
      .get(`/members/${id}`)
      .set(u.admin);
    const list = await request(started.app.server).get('/members').set(u.admin);

    for (const response of [detail, list]) {
      expect(response.status).toBe(500);
      expect(response.text).not.toMatch(/Maria|99999|exemplo|trilha fora/);
    }
  });

  it('limite de leitura por IP: a 61ª ficha em um minuto recebe 429', async () => {
    const started = await start();
    const { admin } = await users(started.app);
    const id = (await create(started, admin, maria)).body.id as string;

    const statuses: number[] = [];
    for (let i = 0; i < 61; i += 1) {
      statuses.push(
        (await request(started.app.server).get(`/members/${id}`).set(admin))
          .status,
      );
    }

    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe('PATCH /members/:id', () => {
  it('altera o cadastro (204) e o que foi enviado como null é apagado', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;

    const response = await request(started.app.server)
      .patch(`/members/${id}`)
      .set(u.secretary1)
      .send({ fullName: 'Maria Souza', phone: null, address: null });

    expect(response.status).toBe(204);
    const detail = (
      await request(started.app.server).get(`/members/${id}`).set(u.admin)
    ).body;
    expect(detail).toMatchObject({
      fullName: 'Maria Souza',
      phone: null,
      address: null,
      email: 'maria@exemplo.com',
    });
  });

  it('NÃO muda congregação nem situação por aqui (ignora os campos)', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;

    await request(started.app.server)
      .patch(`/members/${id}`)
      .set(u.admin)
      .send({
        fullName: 'Maria Souza',
        congregationId: C2,
        status: 'DECEASED',
      });

    const detail = (
      await request(started.app.server).get(`/members/${id}`).set(u.admin)
    ).body;
    expect(detail).toMatchObject({ congregationId: C1, status: 'ACTIVE' });
  });

  it('quem só lê vê o membro mas não o altera (403); quem não vê leva 404', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;

    const readOnly = await request(started.app.server)
      .patch(`/members/${id}`)
      .set(u.reader1)
      .send({ fullName: 'X Y' });
    const writeOnly = await request(started.app.server)
      .patch(`/members/${id}`)
      .set(u.writerNoRead)
      .send({ fullName: 'X Y' });

    expect(readOnly.status).toBe(403);
    // Escrever sem poder LER a congregação: não enxerga o membro, então 404 (as permissões são independentes).
    expect(writeOnly.status).toBe(404);
  });
});

describe('situação, transferência e história', () => {
  async function withMember() {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;
    const post = (
      path: string,
      auth: { Authorization: string },
      body: object,
    ) =>
      request(started.app.server)
        .post(`/members/${id}/${path}`)
        .set(auth)
        .send(body);
    const history = async () =>
      (
        (await request(started.app.server).get(`/members/${id}`).set(u.admin))
          .body.history as { type: string }[]
      ).map((e) => e.type);
    return { started, u, id, post, history };
  }

  it('situação: muda (204), deixa rastro e repetir dá 409', async () => {
    const { post, history, u } = await withMember();

    expect(
      (await post('status', u.secretary1, { status: 'AWAY' })).status,
    ).toBe(204);
    const again = await post('status', u.secretary1, { status: 'AWAY' });

    expect(again.status).toBe(409);
    expect(again.body.code).toBe('members.already_in_status');
    expect(await history()).toEqual(['STATUS_CHANGE', 'REGISTERED']);
  });

  it('transferência exige escrever na ORIGEM e no DESTINO', async () => {
    const { post, u, history } = await withMember();

    const scoped = await post('transfer', u.secretary1, { congregationId: C2 });
    const director = await post('transfer', u.director, { congregationId: C2 });

    expect(scoped.status).toBe(403);
    expect(director.status).toBe(204);
    expect(await history()).toEqual(['TRANSFER', 'REGISTERED']);
  });

  it('depois de transferido, a secretária da origem deixa de ver o membro (404)', async () => {
    const { started, post, u, id } = await withMember();
    await post('transfer', u.director, { congregationId: C2 });

    const response = await request(started.app.server)
      .get(`/members/${id}`)
      .set(u.secretary1);

    expect(response.status).toBe(404);
  });

  it.each([
    ['desativada', congId(4)],
    ['de OUTRA igreja', congId(10)],
  ])('transferir para congregação %s: 422', async (_nome, destination) => {
    const { post, u } = await withMember();

    const response = await post('transfer', u.admin, {
      congregationId: destination,
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('members.congregation_unavailable');
  });

  it('história: registra batismo (204); tipo gerado pelo sistema ou data futura são recusados', async () => {
    const { post, history, u } = await withMember();

    expect(
      (
        await post('history', u.secretary1, {
          type: 'BAPTISM',
          occurredOn: '2010-03-14',
          notes: 'Em Recife',
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await post('history', u.secretary1, {
          type: 'TRANSFER',
          occurredOn: '2010-03-14',
        })
      ).status,
    ).toBe(400);
    const future = await post('history', u.secretary1, {
      type: 'BAPTISM',
      occurredOn: '2999-01-01',
    });

    expect(future.status).toBe(422);
    expect(await history()).toEqual(['BAPTISM', 'REGISTERED']);
  });

  it('leitor não executa nenhuma dessas ações: 403', async () => {
    const { post, u } = await withMember();

    for (const [path, body] of [
      ['status', { status: 'AWAY' }],
      ['transfer', { congregationId: C2 }],
      ['history', { type: 'BAPTISM', occurredOn: '2010-03-14' }],
    ] as const) {
      expect((await post(path, u.reader1, body)).status, path).toBe(403);
    }
  });
});

describe('POST /members/:id/anonymize (LGPD, irreversível)', () => {
  it('só quem tem members:anonymize na IGREJA TODA: secretária e diretor sem a permissão levam 403', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;

    for (const auth of [u.secretary1, u.director, u.readerAll]) {
      const response = await request(started.app.server)
        .post(`/members/${id}/anonymize`)
        .set(auth);
      expect(response.status).toBe(403);
    }
    expect(
      (await request(started.app.server).get(`/members/${id}`).set(u.admin))
        .body.fullName,
    ).toBe('Maria da Silva');
  });

  it('o administrador apaga os dados pessoais: a ficha vira "Membro anonimizado" e ele sai da lista', async () => {
    const started = await start();
    const u = await users(started.app);
    const id = (await create(started, u.admin, maria)).body.id as string;
    await request(started.app.server)
      .post(`/members/${id}/history`)
      .set(u.admin)
      .send({
        type: 'BAPTISM',
        occurredOn: '2010-03-14',
        notes: 'Observação com dado pessoal',
      });

    const response = await request(started.app.server)
      .post(`/members/${id}/anonymize`)
      .set(u.admin);
    const detail = await request(started.app.server)
      .get(`/members/${id}`)
      .set(u.admin);
    const list = await request(started.app.server).get('/members').set(u.admin);

    expect(response.status).toBe(204);
    expect(detail.body).toMatchObject({
      fullName: 'Membro anonimizado',
      birthDate: null,
      phone: null,
      email: null,
      address: null,
      anonymized: true,
      capabilities: { canEdit: false, canAnonymize: false },
    });
    expect(
      detail.body.history.every(
        (e: { notes: string | null }) => e.notes === null,
      ),
    ).toBe(true);
    expect(detail.text).not.toMatch(/Maria|99999|exemplo|Flores|Observação/);
    expect(list.body.items).toEqual([]);
  });

  it('é irreversível: nenhuma alteração é aceita depois (409), nem anonimizar de novo', async () => {
    const started = await start();
    const { admin } = await users(started.app);
    const id = (await create(started, admin, maria)).body.id as string;
    await request(started.app.server)
      .post(`/members/${id}/anonymize`)
      .set(admin);

    const patch = await request(started.app.server)
      .patch(`/members/${id}`)
      .set(admin)
      .send({ fullName: 'Ressuscitada' });
    const again = await request(started.app.server)
      .post(`/members/${id}/anonymize`)
      .set(admin);

    expect(patch.status).toBe(409);
    expect(patch.body.code).toBe('members.anonymized');
    expect(again.status).toBe(409);
  });

  it('audita quem apagou, e a trilha não guarda nada do que foi apagado', async () => {
    const started = await start();
    const { admin } = await users(started.app);
    const id = (await create(started, admin, maria)).body.id as string;
    started.audit.entries.length = 0;

    await request(started.app.server)
      .post(`/members/${id}/anonymize`)
      .set(admin);

    expect(started.audit.entries).toEqual([
      expect.objectContaining({ action: 'member.anonymized', entityId: id }),
    ]);
    expect(JSON.stringify(started.audit.entries)).not.toMatch(
      /Maria|99999|exemplo/,
    );
  });
});

describe('isolamento entre igrejas (ADR 0003)', () => {
  it('o membro de OUTRA igreja é inalcançável por qualquer rota, mesmo para o administrador', async () => {
    const started = await start();
    const { admin } = await users(started.app);
    const { app, foreignId } = started;
    const attempts = [
      request(app.server).get(`/members/${foreignId}`).set(admin),
      request(app.server)
        .patch(`/members/${foreignId}`)
        .set(admin)
        .send({ fullName: 'Invasão' }),
      request(app.server)
        .post(`/members/${foreignId}/status`)
        .set(admin)
        .send({ status: 'AWAY' }),
      request(app.server)
        .post(`/members/${foreignId}/transfer`)
        .set(admin)
        .send({ congregationId: C2 }),
      request(app.server)
        .post(`/members/${foreignId}/history`)
        .set(admin)
        .send({ type: 'BAPTISM', occurredOn: '2010-03-14' }),
      request(app.server).post(`/members/${foreignId}/anonymize`).set(admin),
    ];

    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(404);
    }
    const untouched = await started.repository.findById(
      orgId(2),
      memberId(900),
    );
    expect(untouched).toMatchObject({
      status: 'ACTIVE',
      anonymizedAt: null,
      version: 0,
    });
    expect(untouched?.fullName.value).toBe('Maria de Outra Igreja');
  });
});
