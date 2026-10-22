import {
  accountSchema,
  categorySchema,
  contributorSchema,
  dashboardSchema,
  entryListResponseSchema,
  memberContributionsSchema,
  transferDestinationSchema,
} from '@igreja/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type HttpTestApp,
  startHttpTestApp,
  TEST_ADMIN_EMAIL,
  TEST_PASSWORD,
} from '../../../identity-access/presentation/http/testing/http-test-app.js';
import {
  FakeCongregationDirectory,
  FakeMemberDirectory,
} from '../../application/testing/test-bed.js';
import {
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  InMemoryEntryRepository,
} from '../../domain/testing/in-memory-finance.repositories.js';
import {
  aCategory,
  aConfiguration,
  anAccount,
  anIncome,
  accountId,
  categoryId,
  congId,
  entryId,
  member,
  orgId,
} from '../../domain/testing/fixtures.js';
import { FinanceModule } from '../../finance.module.js';
import {
  ACCOUNT_REPOSITORY,
  CATEGORY_REPOSITORY,
  CLOCK,
  CONGREGATION_DIRECTORY,
  ENTRY_REPOSITORY,
  MEMBER_DIRECTORY,
} from '../../finance.tokens.js';

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

const C1 = congId(1); // a sede
const C2 = congId(2);

/**
 * A aplicação HTTP inteira (guard, filtro de erros, limite de taxa) com repositórios, diretórios e trilha em memória.
 * Cenário das fixtures: a igreja 1 tem a sede (congregação 1) e as congregações 2 e 3; contas 1 e 2 na sede, 3 na
 * congregação 2 e 4 na 3. Já existem 20.000 centavos na conta 1 (uma entrada identificada do membro 1) e 5.000 na conta 3.
 */
async function start() {
  const accounts = new InMemoryAccountRepository();
  const categories = new InMemoryCategoryRepository();
  const entries = new InMemoryEntryRepository();
  const congregations = new FakeCongregationDirectory();
  const members = new FakeMemberDirectory();
  for (const spec of aConfiguration.accounts) {
    if (spec.organization === 1) await accounts.add(anAccount(spec.n));
  }
  for (const spec of aConfiguration.categories) {
    if (spec.organization === 1) await categories.add(aCategory(spec.n));
  }
  for (const n of [1, 2, 3]) {
    congregations.set(orgId(1), congId(n), 'ACTIVE', n === 1);
  }
  members.add(orgId(1), member(1), 'Maria da Silva', congId(1));
  members.add(orgId(1), member(2), 'João Pereira', congId(2));
  await entries.add([
    anIncome({ id: 1, account: 1, cents: 20_000, member: 1 }),
    anIncome({ id: 2, account: 3, cents: 5_000 }),
  ]);

  const app = await startHttpTestApp({
    imports: [FinanceModule],
    overrides: (builder, { clock }) =>
      builder
        .overrideProvider(ACCOUNT_REPOSITORY)
        .useValue(accounts)
        .overrideProvider(CATEGORY_REPOSITORY)
        .useValue(categories)
        .overrideProvider(ENTRY_REPOSITORY)
        .useValue(entries)
        .overrideProvider(CONGREGATION_DIRECTORY)
        .useValue(congregations)
        .overrideProvider(MEMBER_DIRECTORY)
        .useValue(members)
        .overrideProvider(CLOCK)
        .useValue(clock),
  });
  running.push(app);
  return { app, entries, accounts };
}

type Started = Awaited<ReturnType<typeof start>>;
type Auth = { Authorization: string };

async function login(app: HttpTestApp, email: string): Promise<Auth> {
  const response = await request(app.server)
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return { Authorization: `Bearer ${response.body.accessToken as string}` };
}

/** Os perfis de teste. A senha de todos é a do `TEST_PASSWORD`. */
async function users(app: HttpTestApp) {
  const make = async (
    n: number,
    permissions: string[],
    congregationId?: ReturnType<typeof congId>,
  ) =>
    login(app, (await app.addUser(n, { permissions, congregationId })).email);

  const individual = 'finance:read-individual';
  return {
    admin: await login(app, TEST_ADMIN_EMAIL),
    // Tesoureiros: leem, lançam e veem quem contribuiu só na própria congregação.
    treasurer1: await make(
      1,
      ['finance:read', 'finance:write', individual],
      C1,
    ),
    treasurer2: await make(
      2,
      ['finance:read', 'finance:write', individual],
      C2,
    ),
    // Diretoria: igreja toda, aprova, não lança.
    board: await make(3, ['finance:read', 'finance:approve', individual]),
    // Dirigente de uma filial: aprova SÓ no escopo dela, que não alcança a sede.
    branchLeader: await make(
      4,
      ['finance:read', 'finance:approve', individual],
      C2,
    ),
    // Só números, na igreja toda, sem ver quem contribuiu.
    reader: await make(5, ['finance:read']),
    nobody: await login(app, (await app.addUser(6)).email),
    // Lança E aprova na sede (só existe para provar que não aprova o que ele mesmo pediu).
    both: await make(
      7,
      ['finance:read', 'finance:write', 'finance:approve'],
      C1,
    ),
  };
}

const today = '2026-10-20';
const expense = (over: object = {}) => ({
  accountId: accountId(1),
  categoryId: categoryId(3),
  amountCents: 4_000,
  occurredOn: today,
  ...over,
});

const post = (s: Started, auth: Auth, path: string, body: object = {}) =>
  request(s.app.server).post(path).set(auth).send(body);
const get = (s: Started, auth: Auth, path: string) =>
  request(s.app.server).get(path).set(auth);

describe('autenticação e permissão de entrada', () => {
  it('sem login: 401 em todas as rotas', async () => {
    const { app } = await start();
    const id = entryId(1);

    for (const [method, path] of [
      ['get', '/finance/accounts'],
      ['post', '/finance/accounts'],
      ['patch', `/finance/accounts/${id}`],
      ['get', '/finance/categories'],
      ['post', '/finance/categories'],
      ['post', '/finance/categories/defaults'],
      ['patch', `/finance/categories/${id}`],
      ['get', '/finance/entries'],
      ['post', '/finance/entries/income'],
      ['post', '/finance/entries/expenses'],
      ['post', '/finance/entries/opening-balances'],
      ['post', '/finance/entries/transfers'],
      ['get', '/finance/transfer-destinations'],
      ['post', `/finance/entries/${id}/reversal`],
      ['post', `/finance/entries/${id}/cancel`],
      ['post', `/finance/entries/${id}/approve`],
      ['post', `/finance/entries/${id}/reject`],
      ['get', '/finance/approvals'],
      ['get', '/finance/dashboard'],
      ['get', '/finance/members/search'],
      ['get', `/finance/members/${member(1)}/contributions`],
    ] as const) {
      const response = await request(app.server)[method](path);
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it('cada rota exige a PERMISSÃO dela: ler, lançar, aprovar e ver quem contribuiu não se implicam', async () => {
    const s = await start();
    const u = await users(s.app);
    const id = entryId(1);

    expect((await get(s, u.nobody, '/finance/accounts')).status).toBe(403);
    expect((await get(s, u.nobody, '/finance/dashboard')).status).toBe(403);
    // Quem só lê não lança.
    expect(
      (await post(s, u.reader, '/finance/entries/expenses', expense())).status,
    ).toBe(403);
    // Quem lança não aprova, nem vê a fila da sede.
    // O 403 vem da PERMISSÃO DA ROTA (o guard), antes de qualquer caso de uso.
    const approve = await post(
      s,
      u.treasurer1,
      `/finance/entries/${id}/approve`,
    );
    expect(approve.status).toBe(403);
    expect(approve.body.code).toBe('identity.permission_denied');
    expect((await get(s, u.treasurer1, '/finance/approvals')).status).toBe(403);
    // Quem aprova não lança.
    expect((await post(s, u.board, '/finance/entries/income', {})).status).toBe(
      403,
    );
    // Quem lê só os números não vê o extrato individual nem a busca de membros.
    expect(
      (await get(s, u.reader, `/finance/members/${member(1)}/contributions`))
        .status,
    ).toBe(403);
    expect(
      (await get(s, u.reader, '/finance/members/search?search=maria')).status,
    ).toBe(403);
  });

  it('categorias são da igreja toda: tesoureiro de UMA congregação não as cria', async () => {
    const s = await start();
    const u = await users(s.app);

    const body = { name: 'Missões', direction: 'OUT' };
    // O guard exige a permissão para a IGREJA TODA já na rota (antes do caso de uso).
    const denied = await post(s, u.treasurer1, '/finance/categories', body);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('identity.permission_denied');
    expect(
      (await post(s, u.treasurer1, '/finance/categories', body)).status,
    ).toBe(403);
    expect(
      (await post(s, u.treasurer1, '/finance/categories/defaults')).status,
    ).toBe(403);
    expect((await post(s, u.admin, '/finance/categories', body)).status).toBe(
      201,
    );
  });
});

describe('contas e categorias', () => {
  it('lista só as contas do escopo, com saldo, no formato do contrato', async () => {
    const s = await start();
    const u = await users(s.app);

    const mine = await get(s, u.treasurer2, '/finance/accounts');
    const all = await get(s, u.reader, '/finance/accounts');

    expect(mine.status).toBe(200);
    expect(
      (mine.body as unknown[]).map((a) => accountSchema.parse(a).id),
    ).toEqual([accountId(3)]);
    expect(accountSchema.parse(mine.body[0]).balanceCents).toBe(5_000);
    expect((all.body as { id: string }[]).map((a) => a.id)).toEqual([
      accountId(1),
      accountId(2),
      accountId(3),
      accountId(4),
    ]);
  });

  it('cria conta na própria congregação (201) e recusa em congregação alheia (403)', async () => {
    const s = await start();
    const u = await users(s.app);
    const body = { name: 'Banco', kind: 'BANK' };

    const created = await post(s, u.treasurer2, '/finance/accounts', {
      ...body,
      congregationId: C2,
    });
    const denied = await post(s, u.treasurer2, '/finance/accounts', {
      ...body,
      congregationId: C1,
    });

    expect(created.status).toBe(201);
    expect(Object.keys(created.body)).toEqual(['id']);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('finance.access_denied');
  });

  it('conta com nome repetido: 409; arquivar: 204 e some da lista', async () => {
    const s = await start();
    const u = await users(s.app);

    const duplicate = await post(s, u.treasurer1, '/finance/accounts', {
      congregationId: C1,
      name: 'conta 1',
      kind: 'CASH',
    });
    const archived = await request(s.app.server)
      .patch(`/finance/accounts/${accountId(2)}`)
      .set(u.treasurer1)
      .send({ archived: true });
    const list = await get(s, u.treasurer1, '/finance/accounts');

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('finance.account_name_taken');
    expect(archived.status).toBe(204);
    expect((list.body as { id: string }[]).map((a) => a.id)).toEqual([
      accountId(1),
    ]);
  });

  it('categorias padrão: criadas uma vez (200 com a contagem) e listadas no contrato', async () => {
    const s = await start();
    const u = await users(s.app);

    const first = await post(s, u.admin, '/finance/categories/defaults');
    const second = await post(s, u.admin, '/finance/categories/defaults');
    const list = await get(s, u.reader, '/finance/categories');

    expect(first.status).toBe(200);
    expect(first.body.created).toBeGreaterThan(0);
    expect(second.body).toEqual({ created: 0 });
    const parsed = (list.body as unknown[]).map((c) => categorySchema.parse(c));
    expect(
      parsed.some((c) => c.name === 'Dízimo' && c.direction === 'IN'),
    ).toBe(true);
  });
});

describe('fluxo do dinheiro: pedir, aprovar, saldo', () => {
  it('a saída nasce PENDENTE, a sede aprova (204) e só então o saldo cai', async () => {
    const s = await start();
    const u = await users(s.app);

    const requested = await post(
      s,
      u.treasurer1,
      '/finance/entries/expenses',
      expense(),
    );
    expect(requested.status).toBe(201);
    const id = requested.body.id as string;

    const before = await get(s, u.treasurer1, '/finance/accounts');
    expect(accountSchema.parse(before.body[0]).balanceCents).toBe(20_000);
    const queue = await get(s, u.board, '/finance/approvals');
    expect(
      entryListResponseSchema.parse(queue.body).items.map((e) => e.id),
    ).toEqual([id]);

    expect(
      (await post(s, u.board, `/finance/entries/${id}/approve`)).status,
    ).toBe(204);

    const after = await get(s, u.treasurer1, '/finance/accounts');
    expect(accountSchema.parse(after.body[0]).balanceCents).toBe(16_000);
    expect(
      entryListResponseSchema.parse(
        (await get(s, u.board, '/finance/approvals')).body,
      ).total,
    ).toBe(0);
  });

  it('QUEM PEDIU NÃO APROVA o próprio pedido (403), mesmo tendo as duas permissões', async () => {
    const s = await start();
    const u = await users(s.app);
    const requested = await post(
      s,
      u.both,
      '/finance/entries/expenses',
      expense(),
    );

    const attempt = await post(
      s,
      u.both,
      `/finance/entries/${requested.body.id}/approve`,
    );

    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe('finance.self_approval_forbidden');
    const entry = await s.entries.findById(orgId(1), requested.body.id);
    expect(entry?.status).toBe('PENDING');
  });

  it('o dirigente de uma FILIAL não aprova: o alcance dele não chega à sede (403)', async () => {
    const s = await start();
    const u = await users(s.app);
    const requested = await post(
      s,
      u.treasurer2,
      '/finance/entries/expenses',
      expense({ accountId: accountId(3) }),
    );

    const attempt = await post(
      s,
      u.branchLeader,
      `/finance/entries/${requested.body.id}/approve`,
    );

    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe('finance.approval_not_allowed');
    expect((await get(s, u.branchLeader, '/finance/approvals')).status).toBe(
      403,
    );
  });

  it('saída maior que o saldo: a aprovação é recusada (422) e o pedido segue pendente', async () => {
    const s = await start();
    const u = await users(s.app);
    const requested = await post(
      s,
      u.treasurer1,
      '/finance/entries/expenses',
      expense({ amountCents: 20_001 }),
    );

    const attempt = await post(
      s,
      u.board,
      `/finance/entries/${requested.body.id}/approve`,
    );

    expect(attempt.status).toBe(422);
    expect(attempt.body.code).toBe('finance.insufficient_balance');
  });

  it('recusar exige o motivo (400 sem o campo, 422 em branco) e fecha o pedido', async () => {
    const s = await start();
    const u = await users(s.app);
    const requested = await post(
      s,
      u.treasurer1,
      '/finance/entries/expenses',
      expense(),
    );
    const id = requested.body.id as string;

    expect(
      (await post(s, u.board, `/finance/entries/${id}/reject`, {})).status,
    ).toBe(400);
    expect(
      (await post(s, u.board, `/finance/entries/${id}/reject`, { note: '  ' }))
        .status,
    ).toBe(422);
    expect(
      (
        await post(s, u.board, `/finance/entries/${id}/reject`, {
          note: 'sem nota',
        })
      ).status,
    ).toBe(204);
    const again = await post(s, u.board, `/finance/entries/${id}/approve`);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('finance.entry_not_pending');
  });

  it('quem pediu desiste (204); depois não dá mais para aprovar', async () => {
    const s = await start();
    const u = await users(s.app);
    const requested = await post(
      s,
      u.treasurer1,
      '/finance/entries/expenses',
      expense(),
    );
    const id = requested.body.id as string;

    expect(
      (await post(s, u.treasurer1, `/finance/entries/${id}/cancel`)).status,
    ).toBe(204);
    expect(
      (await post(s, u.board, `/finance/entries/${id}/approve`)).status,
    ).toBe(409);
  });

  it('o repasse da filial para a sede: as duas pernas pendentes; a sede aprova e o dinheiro muda de conta', async () => {
    const s = await start();
    const u = await users(s.app);

    const destinations = await get(
      s,
      u.treasurer2,
      `/finance/transfer-destinations?fromAccountId=${accountId(3)}`,
    );
    expect(
      (destinations.body as unknown[]).map(
        (d) => transferDestinationSchema.parse(d).id,
      ),
    ).toEqual([accountId(1), accountId(2)]);

    const requested = await post(
      s,
      u.treasurer2,
      '/finance/entries/transfers',
      {
        fromAccountId: accountId(3),
        toAccountId: accountId(1),
        amountCents: 3_000,
        occurredOn: today,
      },
    );
    expect(requested.status).toBe(201);
    expect(Object.keys(requested.body)).toEqual(['transferId']);

    const queue = entryListResponseSchema.parse(
      (await get(s, u.board, '/finance/approvals')).body,
    );
    expect(queue.items).toHaveLength(2);
    expect(
      queue.items.every((e) => e.kind === 'TRANSFER' && e.status === 'PENDING'),
    ).toBe(true);

    expect(
      (await post(s, u.board, `/finance/entries/${queue.items[0]?.id}/approve`))
        .status,
    ).toBe(204);

    const accounts = (await get(s, u.reader, '/finance/accounts')).body as {
      id: string;
      balanceCents: number;
    }[];
    const balance = (n: number) =>
      accounts.find((a) => a.id === accountId(n))?.balanceCents;
    expect(balance(3)).toBe(2_000);
    expect(balance(1)).toBe(23_000);
  });

  it('o repasse entre duas filiais é recusado (422)', async () => {
    const s = await start();
    const u = await users(s.app);

    const response = await post(s, u.admin, '/finance/entries/transfers', {
      fromAccountId: accountId(3),
      toAccountId: accountId(4),
      amountCents: 100,
      occurredOn: today,
    });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('finance.transfer_requires_headquarters');
  });

  it('estorno: pede com motivo (201), é pendente e não repete (409)', async () => {
    const s = await start();
    const u = await users(s.app);

    const first = await post(
      s,
      u.treasurer1,
      `/finance/entries/${entryId(1)}/reversal`,
      { reason: 'duplicado' },
    );
    const second = await post(
      s,
      u.treasurer1,
      `/finance/entries/${entryId(1)}/reversal`,
      { reason: 'de novo' },
    );
    const noReason = await post(
      s,
      u.treasurer1,
      `/finance/entries/${entryId(2)}/reversal`,
      { reason: ' ' },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('finance.already_reversed');
    expect(noReason.status).toBe(422);
  });
});

describe('escopo e isolamento', () => {
  it('o tesoureiro de uma congregação não vê nem mexe nas outras: 404, igual a inexistente', async () => {
    const s = await start();
    const u = await users(s.app);

    const mine = entryListResponseSchema.parse(
      (await get(s, u.treasurer2, '/finance/entries')).body,
    );
    const intruder = await post(s, u.treasurer2, '/finance/entries/income', {
      accountId: accountId(1),
      categoryId: categoryId(1),
      amountCents: 100,
      occurredOn: today,
    });
    const reversal = await post(
      s,
      u.treasurer2,
      `/finance/entries/${entryId(1)}/reversal`,
      { reason: 'x' },
    );

    expect(mine.items.map((e) => e.id)).toEqual([entryId(2)]);
    expect(intruder.status).toBe(404);
    expect(intruder.body.code).toBe('finance.account_not_found');
    expect(reversal.status).toBe(404);
    expect(reversal.body.code).toBe('finance.entry_not_found');
  });

  it('o filtro por congregação só estreita o escopo', async () => {
    const s = await start();
    const u = await users(s.app);

    const page = entryListResponseSchema.parse(
      (await get(s, u.treasurer2, `/finance/entries?congregationId=${C1}`))
        .body,
    );

    expect(page).toMatchObject({ items: [], total: 0 });
  });

  it('o painel do tesoureiro soma só a congregação dele e recusa a alheia (403)', async () => {
    const s = await start();
    const u = await users(s.app);

    const mine = dashboardSchema.parse(
      (await get(s, u.treasurer2, '/finance/dashboard')).body,
    );
    const other = await get(
      s,
      u.treasurer2,
      `/finance/dashboard?congregationId=${C1}`,
    );
    const board = dashboardSchema.parse(
      (await get(s, u.board, '/finance/dashboard')).body,
    );

    expect(mine.scope).toBe('CONGREGATIONS');
    expect(mine.totals.incomeCents).toBe(5_000);
    expect(other.status).toBe(403);
    expect(board.scope).toBe('ORGANIZATION');
    expect(board.totals.incomeCents).toBe(25_000);
    expect(board.totalBalanceCents).toBe(25_000);
  });
});

describe('quem contribuiu (dado sensível)', () => {
  const memberOf = async (s: Started, auth: Auth) => {
    const page = entryListResponseSchema.parse(
      (await get(s, auth, '/finance/entries')).body,
    );
    return page.items.find((e) => e.id === entryId(1));
  };

  it('só aparece para quem tem read-individual; os demais veem apenas que há um membro', async () => {
    const s = await start();
    const u = await users(s.app);

    expect(await memberOf(s, u.reader)).toMatchObject({
      memberLinked: true,
      member: null,
    });
    expect(await memberOf(s, u.treasurer1)).toMatchObject({
      memberLinked: true,
      member: { id: member(1), name: 'Maria da Silva' },
    });
    expect(
      JSON.stringify((await get(s, u.reader, '/finance/entries')).body),
    ).not.toContain('Maria');
  });

  it('a leitura com identidade é auditada, sem nomes; sem identidade a trilha não é exigida', async () => {
    const s = await start();
    const u = await users(s.app);
    s.app.audit.entries.length = 0;

    await get(s, u.reader, '/finance/entries');
    expect(s.app.audit.entries).toEqual([]);
    await get(s, u.treasurer1, '/finance/entries');

    expect(s.app.audit.entries).toEqual([
      expect.objectContaining({
        action: 'finance.contributors_viewed',
        metadata: { entries: 1 },
      }),
    ]);
    expect(JSON.stringify(s.app.audit.entries)).not.toContain('Maria');
  });

  it('FALHA FECHADA: sem trilha, a identidade não sai (500) — e quem não vê identidade segue lendo', async () => {
    const s = await start();
    const u = await users(s.app);
    s.app.audit.failWith = new Error('trilha fora do ar');

    const withIdentity = await get(s, u.treasurer1, '/finance/entries');
    const withoutIdentity = await get(s, u.reader, '/finance/entries');

    expect(withIdentity.status).toBe(500);
    expect(JSON.stringify(withIdentity.body)).not.toContain('Maria');
    expect(withoutIdentity.status).toBe(200);
  });

  it('extrato do membro: no contrato, auditado com o membro como entidade, só no escopo do usuário', async () => {
    const s = await start();
    const u = await users(s.app);
    s.app.audit.entries.length = 0;

    const statement = await get(
      s,
      u.treasurer1,
      `/finance/members/${member(1)}/contributions`,
    );

    expect(statement.status).toBe(200);
    expect(memberContributionsSchema.parse(statement.body)).toMatchObject({
      member: { id: member(1), name: 'Maria da Silva' },
      netCents: 20_000,
    });
    expect(s.app.audit.entries).toEqual([
      expect.objectContaining({
        action: 'finance.member_contributions_viewed',
        entity: 'member',
        entityId: member(1),
      }),
    ]);
    // O tesoureiro da congregação 2 não tem nada a ver com esse membro: para ele, ele não existe.
    const hidden = await get(
      s,
      u.treasurer2,
      `/finance/members/${member(1)}/contributions`,
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe('finance.member_not_found');
  });

  it('FALHA FECHADA no extrato: sem trilha, nada sai', async () => {
    const s = await start();
    const u = await users(s.app);
    s.app.audit.failWith = new Error('trilha fora do ar');

    const statement = await get(
      s,
      u.treasurer1,
      `/finance/members/${member(1)}/contributions`,
    );

    expect(statement.status).toBe(500);
    expect(JSON.stringify(statement.body)).not.toContain('Maria');
  });

  it('busca mínima de membro: só id, nome e congregação, só onde o usuário vê contribuição individual', async () => {
    const s = await start();
    const u = await users(s.app);

    const found = await get(
      s,
      u.treasurer1,
      '/finance/members/search?search=silva',
    );
    const none = await get(
      s,
      u.treasurer2,
      '/finance/members/search?search=silva',
    );

    expect(found.status).toBe(200);
    expect(
      (found.body as unknown[]).map((c) => contributorSchema.parse(c)),
    ).toEqual([
      { id: member(1), fullName: 'Maria da Silva', congregationId: C1 },
    ]);
    expect(none.body).toEqual([]);
    expect(
      (await get(s, u.treasurer1, '/finance/members/search?search=a')).status,
    ).toBe(422);
  });

  it('lançar entrada ligando um membro exige read-individual', async () => {
    const s = await start();
    const u = await users(s.app);
    const noIndividual = await login(
      s.app,
      (
        await s.app.addUser(20, {
          permissions: ['finance:read', 'finance:write'],
          congregationId: C1,
        })
      ).email,
    );
    const body = {
      accountId: accountId(1),
      categoryId: categoryId(1),
      amountCents: 1_000,
      occurredOn: today,
      memberId: member(1),
    };

    expect(
      (await post(s, noIndividual, '/finance/entries/income', body)).status,
    ).toBe(403);
    expect(
      (await post(s, u.treasurer1, '/finance/entries/income', body)).status,
    ).toBe(201);
  });
});

describe('validação de entrada', () => {
  it('valor, data e ids malformados: 400; data futura: 422 (regra do domínio)', async () => {
    const s = await start();
    const u = await users(s.app);
    const base = {
      accountId: accountId(1),
      categoryId: categoryId(1),
      amountCents: 100,
      occurredOn: today,
    };

    for (const bad of [
      { amountCents: 0 },
      { amountCents: -5 },
      { amountCents: 1.5 },
      { amountCents: '100' },
      { occurredOn: '20/10/2026' },
      { accountId: 'abc' },
    ]) {
      const response = await post(s, u.treasurer1, '/finance/entries/income', {
        ...base,
        ...bad,
      });
      expect(response.status, JSON.stringify(bad)).toBe(400);
    }
    expect(
      (
        await post(s, u.treasurer1, '/finance/entries/income', {
          ...base,
          occurredOn: '2026-10-21',
        })
      ).status,
    ).toBe(422);
    expect(
      (await post(s, u.board, '/finance/entries/not-a-uuid/approve')).status,
    ).toBe(400);
  });

  it('paginação e filtros fora dos limites: 400', async () => {
    const s = await start();
    const u = await users(s.app);

    for (const query of [
      'limit=0',
      'limit=101',
      'offset=-1',
      'status=LIDO',
      'from=ontem',
    ]) {
      expect(
        (await get(s, u.reader, `/finance/entries?${query}`)).status,
        query,
      ).toBe(400);
    }
  });
});
