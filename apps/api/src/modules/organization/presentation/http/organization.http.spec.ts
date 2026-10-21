import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type HttpTestApp,
  startHttpTestApp,
  TEST_ADMIN_EMAIL,
  TEST_ORGANIZATION,
  TEST_PASSWORD,
} from '../../../identity-access/presentation/http/testing/http-test-app.js';
import { CongregationId } from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { aTestBed } from '../../application/testing/test-bed.js';
import { CreateOrganizationUseCase } from '../../application/create-organization.use-case.js';
import { ORGANIZATION_REPOSITORY } from '../../organization.tokens.js';

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

/**
 * A aplicação HTTP inteira com a igreja de teste ("Igreja Central", sede "Sede") e uma SEGUNDA igreja ("Igreja B"),
 * para provar o isolamento: nada que o administrador da primeira faça deve alcançar a segunda.
 */
async function start() {
  const bed = await aTestBed();
  const other = await new CreateOrganizationUseCase(
    bed.repository,
    bed.ids,
  ).execute({ name: 'Igreja B', headquarters: { name: 'Sede B' } });

  const app = await startHttpTestApp({
    overrides: (builder) =>
      builder
        .overrideProvider(ORGANIZATION_REPOSITORY)
        .useValue(bed.repository),
  });
  running.push(app);

  // O primeiro id gerado pela bancada é a igreja de teste das duas pontas (identity e organization).
  expect(bed.context.organizationId).toBe(TEST_ORGANIZATION);

  return { app, bed, other };
}

type Started = Awaited<ReturnType<typeof start>>;

async function tokenFor(app: HttpTestApp, email = TEST_ADMIN_EMAIL) {
  const response = await request(app.server)
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return { Authorization: `Bearer ${response.body.accessToken as string}` };
}

const asAdmin = async ({ app }: Started) => ({
  app,
  auth: await tokenFor(app),
});

const address = {
  street: 'Rua das Flores',
  number: '100',
  city: 'Recife',
  state: 'PE',
};
const sundayService = {
  weekday: 'SUNDAY',
  time: '19:00',
  name: 'Culto de celebração',
};

describe('GET /organization', () => {
  it('devolve a igreja de quem está logado', async () => {
    const started = await start();
    const { app, auth } = await asAdmin(started);

    const response = await request(app.server).get('/organization').set(auth);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: TEST_ORGANIZATION,
      name: 'Igreja Central',
    });
  });

  it('exige login', async () => {
    const { app } = await start();

    expect((await request(app.server).get('/organization')).status).toBe(401);
  });
});

describe('PATCH /organization', () => {
  it('renomeia a igreja', async () => {
    const { app, bed } = await start();
    const auth = await tokenFor(app);

    const response = await request(app.server)
      .patch('/organization')
      .set(auth)
      .send({ name: '  Igreja   Nova  ' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Igreja Nova');
    expect((await bed.repository.findById(TEST_ORGANIZATION))?.name.value).toBe(
      'Igreja Nova',
    );
  });

  it('nome vazio: 422 do domínio; corpo com tipo errado: 400', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const empty = await request(app.server)
      .patch('/organization')
      .set(auth)
      .send({ name: '   ' });
    const wrongType = await request(app.server)
      .patch('/organization')
      .set(auth)
      .send({ name: 42 });

    expect(empty.status).toBe(422);
    expect(empty.body.code).toBe('validation.invalid_value');
    expect(wrongType.status).toBe(400);
  });

  it('quem só pode ler não altera: 403', async () => {
    const { app } = await start();
    const reader = await app.addUser(1, { permissions: ['organization:read'] });
    const auth = await tokenFor(app, reader.email);

    const response = await request(app.server)
      .patch('/organization')
      .set(auth)
      .send({ name: 'Hackeada' });

    expect(response.status).toBe(403);
  });
});

describe('PATCH /organization (escopo)', () => {
  it('quem gerencia só UMA congregação não renomeia a igreja inteira: 403', async () => {
    const { app } = await start();
    const scopedManager = await app.addUser(1, {
      permissions: ['organization:manage'],
      congregationId: CongregationId.of(uuidFor(2)),
    });
    const auth = await tokenFor(app, scopedManager.email);

    const response = await request(app.server)
      .patch('/organization')
      .set(auth)
      .send({ name: 'Renomeada por quem nao pode' });

    expect(response.status).toBe(403);
  });
});

describe('GET /congregations', () => {
  it('lista as congregações da igreja, no formato do contrato', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const response = await request(app.server).get('/congregations').set(auth);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: expect.any(String),
        name: 'Sede',
        isHeadquarters: true,
        status: 'ACTIVE',
        address: null,
        serviceTimes: [],
      },
    ]);
  });

  it('NUNCA mostra congregações de outra igreja', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const response = await request(app.server).get('/congregations').set(auth);

    expect(JSON.stringify(response.body)).not.toContain('Sede B');
  });

  it('filtra por situação e recusa valor desconhecido com 400', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const inactive = await request(app.server)
      .get('/congregations')
      .query({ status: 'INACTIVE' })
      .set(auth);
    const bogus = await request(app.server)
      .get('/congregations')
      .query({ status: 'TODAS' })
      .set(auth);

    expect(inactive.body).toEqual([]);
    expect(bogus.status).toBe(400);
  });

  it('quem tem organization:read em UMA congregação já pode listar (precisa enxergar as outras)', async () => {
    const { app } = await start();
    const leader = await app.addUser(1, {
      permissions: ['organization:read'],
      congregationId: CongregationId.of(uuidFor(2)),
    });
    const auth = await tokenFor(app, leader.email);

    expect(
      (await request(app.server).get('/congregations').set(auth)).status,
    ).toBe(200);
  });

  it('sem a permissão: 403; sem login: 401', async () => {
    const { app } = await start();
    const nobody = await app.addUser(1);
    const auth = await tokenFor(app, nobody.email);

    expect(
      (await request(app.server).get('/congregations').set(auth)).status,
    ).toBe(403);
    expect((await request(app.server).get('/congregations')).status).toBe(401);
  });
});

describe('POST /congregations', () => {
  it('cria a congregação (201) com endereço e horários, e ela aparece na lista', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const created = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({ name: 'Filial Norte', address, serviceTimes: [sundayService] });
    const list = await request(app.server).get('/congregations').set(auth);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Filial Norte',
      isHeadquarters: false,
      status: 'ACTIVE',
      address: {
        ...address,
        complement: null,
        district: null,
        postalCode: null,
      },
      serviceTimes: [sundayService],
    });
    expect(list.body.map((c: { name: string }) => c.name)).toEqual([
      'Filial Norte',
      'Sede',
    ]);
  });

  it('ignora campos que o cliente não deveria mandar (igreja, sede, situação)', async () => {
    const { app, bed } = await start();
    const auth = await tokenFor(app);

    const created = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({
        name: 'Filial Sul',
        organizationId: uuidFor(3),
        isHeadquarters: true,
        status: 'INACTIVE',
      });

    expect(created.status).toBe(201);
    expect(created.body.isHeadquarters).toBe(false);
    expect(created.body.status).toBe('ACTIVE');
    const organization = await bed.repository.findById(TEST_ORGANIZATION);
    expect(
      organization?.congregations.map((c) => c.name.value).toSorted(),
    ).toEqual(['Filial Sul', 'Sede']);
  });

  it('nome repetido na igreja: 409; o mesmo nome em OUTRA igreja não conflita', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const sameAsHq = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({ name: '  sede ' });
    const sameAsOtherChurch = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({ name: 'Sede B' });

    expect(sameAsHq.status).toBe(409);
    expect(sameAsHq.body.code).toBe('organization.congregation_name_taken');
    expect(sameAsOtherChurch.status).toBe(201);
  });

  it('regra de domínio recusa UF que não existe: 422', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const response = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({ name: 'Filial', address: { ...address, state: 'XX' } });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation.invalid_value');
  });

  it('corpo fora do contrato: 400 apontando o campo', async () => {
    const { app } = await start();
    const auth = await tokenFor(app);

    const response = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({
        name: 'Filial',
        serviceTimes: [{ ...sundayService, time: '7pm' }],
      });

    expect(response.status).toBe(400);
    expect(response.body.errors[0].path).toBe('serviceTimes.0.time');
  });

  it('exige gerenciar a IGREJA TODA: leitor, dirigente de uma congregação e sem permissão levam 403', async () => {
    const { app } = await start();
    const reader = await app.addUser(1, { permissions: ['organization:read'] });
    const scopedManager = await app.addUser(2, {
      permissions: ['organization:manage'],
      congregationId: CongregationId.of(uuidFor(2)),
    });
    const nobody = await app.addUser(3);

    for (const user of [reader, scopedManager, nobody]) {
      const auth = await tokenFor(app, user.email);
      const response = await request(app.server)
        .post('/congregations')
        .set(auth)
        .send({ name: 'Intrusa' });
      expect(response.status).toBe(403);
    }
  });

  it('um papel com organization:manage na igreja toda também pode (não só o administrador)', async () => {
    const { app } = await start();
    const manager = await app.addUser(1, {
      permissions: ['organization:manage'],
    });

    const auth = await tokenFor(app, manager.email);

    const response = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({ name: 'Criada por gestor' });

    expect(response.status).toBe(201);
  });
});

describe('PATCH /congregations/:id', () => {
  async function withFilial() {
    const started = await start();
    const { app, auth } = await asAdmin(started);
    const created = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({ name: 'Filial', address, serviceTimes: [sundayService] });
    return { ...started, auth, id: created.body.id as string };
  }

  it('altera só o que foi enviado e mantém o resto', async () => {
    const { app, auth, id } = await withFilial();

    const response = await request(app.server)
      .patch(`/congregations/${id}`)
      .set(auth)
      .send({ name: 'Filial Renomeada' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: 'Filial Renomeada',
      address: { street: 'Rua das Flores' },
      serviceTimes: [sundayService],
    });
  });

  it('address: null remove o endereço; serviceTimes: [] remove os horários', async () => {
    const { app, auth, id } = await withFilial();

    const response = await request(app.server)
      .patch(`/congregations/${id}`)
      .set(auth)
      .send({ address: null, serviceTimes: [] });

    expect(response.body.address).toBeNull();
    expect(response.body.serviceTimes).toEqual([]);
  });

  it('id de OUTRA igreja é 404, igual a um que não existe', async () => {
    const { app, auth, other } = await withFilial();
    const otherChurchCongregation = other.headquartersId;

    const foreign = await request(app.server)
      .patch(`/congregations/${otherChurchCongregation}`)
      .set(auth)
      .send({ name: 'Sequestrada' });
    const missing = await request(app.server)
      .patch(`/congregations/${uuidFor(99999)}`)
      .set(auth)
      .send({ name: 'Nada' });

    for (const response of [foreign, missing]) {
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('organization.congregation_not_found');
    }
    // A mensagem só cita o id que o próprio chamador enviou: nada da outra igreja vaza.
    expect(foreign.body.detail).not.toContain('Sede B');
  });

  it('id mal formado na URL: 400', async () => {
    const { app, auth } = await withFilial();

    const response = await request(app.server)
      .patch('/congregations/nao-e-um-id')
      .set(auth)
      .send({ name: 'X' });

    expect(response.status).toBe(400);
  });
});

describe('ações de situação', () => {
  async function setup() {
    const started = await start();
    const { app, auth } = await asAdmin(started);
    const list = await request(app.server).get('/congregations').set(auth);
    const headquartersId = list.body[0].id as string;
    const created = await request(app.server)
      .post('/congregations')
      .set(auth)
      .send({ name: 'Filial' });
    return {
      ...started,
      auth,
      headquartersId,
      filialId: created.body.id as string,
    };
  }

  it('desativa e reativa uma congregação, devolvendo-a atualizada', async () => {
    const { app, auth, filialId } = await setup();

    const off = await request(app.server)
      .post(`/congregations/${filialId}/deactivate`)
      .set(auth);
    const onlyInactive = await request(app.server)
      .get('/congregations')
      .query({ status: 'INACTIVE' })
      .set(auth);
    const on = await request(app.server)
      .post(`/congregations/${filialId}/reactivate`)
      .set(auth);

    expect(off.status).toBe(200);
    expect(off.body.status).toBe('INACTIVE');
    expect(onlyInactive.body.map((c: { id: string }) => c.id)).toEqual([
      filialId,
    ]);
    expect(on.status).toBe(200);
    expect(on.body.status).toBe('ACTIVE');
  });

  it('a sede não pode ser desativada: 409', async () => {
    const { app, auth, headquartersId } = await setup();

    const response = await request(app.server)
      .post(`/congregations/${headquartersId}/deactivate`)
      .set(auth);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe(
      'organization.cannot_deactivate_headquarters',
    );
  });

  it('repetir a mesma ação: 409', async () => {
    const { app, auth, filialId } = await setup();
    await request(app.server)
      .post(`/congregations/${filialId}/deactivate`)
      .set(auth);

    const again = await request(app.server)
      .post(`/congregations/${filialId}/deactivate`)
      .set(auth);

    expect(again.status).toBe(409);
    expect(again.body.code).toBe('organization.congregation_already_in_status');
  });

  it('designa outra sede: a nova vira sede e a antiga deixa de ser (sempre exatamente uma)', async () => {
    const { app, auth, filialId, headquartersId } = await setup();

    const response = await request(app.server)
      .post(`/congregations/${filialId}/designate-headquarters`)
      .set(auth);
    const list = await request(app.server).get('/congregations').set(auth);

    expect(response.status).toBe(200);
    expect(response.body.isHeadquarters).toBe(true);
    const headquarters = list.body.filter(
      (c: { isHeadquarters: boolean }) => c.isHeadquarters,
    );
    expect(headquarters.map((c: { id: string }) => c.id)).toEqual([filialId]);
    expect(headquarters.map((c: { id: string }) => c.id)).not.toContain(
      headquartersId,
    );
  });

  it('congregação desativada não pode virar sede: 409', async () => {
    const { app, auth, filialId } = await setup();
    await request(app.server)
      .post(`/congregations/${filialId}/deactivate`)
      .set(auth);

    const response = await request(app.server)
      .post(`/congregations/${filialId}/designate-headquarters`)
      .set(auth);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('organization.congregation_inactive');
  });

  it.each(['deactivate', 'reactivate', 'designate-headquarters'])(
    '%s em congregação de OUTRA igreja: 404, e a outra igreja fica intacta',
    async (action) => {
      const { app, auth, bed, other } = await setup();

      const response = await request(app.server)
        .post(`/congregations/${other.headquartersId}/${action}`)
        .set(auth);

      expect(response.status).toBe(404);
      const untouched = await bed.repository.findById(other.organizationId);
      expect(untouched?.congregations).toHaveLength(1);
      expect(untouched?.headquarters.status).toBe('ACTIVE');
    },
  );

  it('quem só lê não executa nenhuma ação: 403', async () => {
    const { app, filialId } = await setup();
    const reader = await app.addUser(1, { permissions: ['organization:read'] });
    const auth = await tokenFor(app, reader.email);

    for (const action of [
      'deactivate',
      'reactivate',
      'designate-headquarters',
    ]) {
      const response = await request(app.server)
        .post(`/congregations/${filialId}/${action}`)
        .set(auth);
      expect(response.status).toBe(403);
    }
  });
});
