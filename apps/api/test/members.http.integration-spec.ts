import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { CreateAdministratorUseCase } from '../src/modules/identity-access/application/create-administrator.use-case.js';
import { CreateOrganizationUseCase } from '../src/modules/organization/application/create-organization.use-case.js';
import { ENV } from '../src/platform/config/config.module.js';
import type { Env } from '../src/platform/config/env.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { configureHttpApp } from '../src/platform/http/configure-http-app.js';
import { cleanDatabase } from './support/clean-database.js';

const PASSWORD = 'senha-super-segura-1';

let app: NestExpressApplication;
let prisma: PrismaService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureHttpApp(app, app.get<Env>(ENV));
  await app.init();
  prisma = app.get(PrismaService);
});

beforeEach(async () => {
  await cleanDatabase(prisma);
});

afterAll(async () => {
  await cleanDatabase(prisma);
  await app.close();
});

/** Uma igreja de verdade (com sede) e o administrador dela, criados pelos mesmos casos de uso do operador. */
async function church(name: string, email: string) {
  const created = await app
    .get(CreateOrganizationUseCase)
    .execute({ name, headquarters: { name: `Sede ${name}` } });
  await app.get(CreateAdministratorUseCase).execute({
    organizationId: created.organizationId,
    email,
    password: PASSWORD,
  });
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return {
    ...created,
    auth: { Authorization: `Bearer ${login.body.accessToken as string}` },
  };
}

describe('membros: API + PostgreSQL de ponta a ponta', () => {
  it('cadastra, lê, lista e anonimiza; a trilha de auditoria fica no banco e não guarda dado pessoal', async () => {
    const mine = await church('Igreja Central', 'admin@central.com');
    const server = app.getHttpServer();

    const created = await request(server).post('/members').set(mine.auth).send({
      congregationId: mine.headquartersId,
      fullName: 'Maria da Silva',
      birthDate: '1990-05-10',
      phone: '(81) 99999-8888',
      email: 'maria@exemplo.com',
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    const detail = await request(server).get(`/members/${id}`).set(mine.auth);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      fullName: 'Maria da Silva',
      birthDate: '1990-05-10',
      phone: '81999998888',
      congregationId: mine.headquartersId,
    });

    const list = await request(server)
      .get('/members')
      .query({ search: 'maria' })
      .set(mine.auth);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([id]);

    await request(server)
      .post(`/members/${id}/history`)
      .set(mine.auth)
      .send({
        type: 'BAPTISM',
        occurredOn: '2010-03-14',
        notes: 'Observação com dado pessoal',
      })
      .expect(204);
    await request(server)
      .post(`/members/${id}/anonymize`)
      .set(mine.auth)
      .expect(204);

    const row = await prisma.member.findUnique({ where: { id } });
    expect(row).toMatchObject({
      fullName: 'Membro anonimizado',
      birthDate: null,
      phone: null,
      email: null,
      address: null,
    });
    expect(row?.anonymizedAt).not.toBeNull();
    const notes = await prisma.memberHistoryEvent.findMany({
      where: { memberId: id },
    });
    expect(notes.every((event) => event.notes === null)).toBe(true);

    const trail = await prisma.auditLog.findMany({
      orderBy: { occurredAt: 'asc' },
    });
    expect(trail.map((entry) => entry.action)).toEqual([
      'member.registered',
      'member.viewed',
      'member.listed',
      'member.event_recorded',
      'member.anonymized',
    ]);
    expect(JSON.stringify(trail)).not.toMatch(/Maria|99999|exemplo|Observação/);
  });

  it('uma igreja NUNCA alcança os membros da outra, pelo banco real', async () => {
    const central = await church('Igreja Central', 'admin@central.com');
    const other = await church('Igreja B', 'admin@b.com');
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/members')
      .set(central.auth)
      .send({
        congregationId: central.headquartersId,
        fullName: 'Maria da Silva',
      })
      .expect(201);

    const detail = await request(server)
      .get(`/members/${created.body.id}`)
      .set(other.auth);
    const list = await request(server).get('/members').set(other.auth);
    const intrusion = await request(server)
      .post('/members')
      .set(other.auth)
      .send({ congregationId: central.headquartersId, fullName: 'Intrusa' });

    expect(detail.status).toBe(404);
    expect(list.body.items).toEqual([]);
    expect(intrusion.status).toBe(422);
    expect(await prisma.member.count()).toBe(1);
  });

  it('a congregação desativada não recebe membros', async () => {
    const mine = await church('Igreja Central', 'admin@central.com');
    const server = app.getHttpServer();
    const filial = await request(server)
      .post('/congregations')
      .set(mine.auth)
      .send({ name: 'Filial' })
      .expect(201);
    await request(server)
      .post(`/congregations/${filial.body.id}/deactivate`)
      .set(mine.auth)
      .expect(200);

    const response = await request(server)
      .post('/members')
      .set(mine.auth)
      .send({ congregationId: filial.body.id, fullName: 'Maria da Silva' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('members.congregation_unavailable');
  });
});
