import { Controller, Get } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CurrentContext,
  Public,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { SessionId, UserId } from '../../domain/ids.js';
import { NOW } from '../../domain/testing/fixtures.js';
import {
  type HttpTestApp,
  startHttpTestApp,
  TEST_ADMIN_EMAIL as EMAIL,
  TEST_ORGANIZATION as ORGANIZATION,
  TEST_PASSWORD as PASSWORD,
} from './testing/http-test-app.js';

const OTHER_ORGANIZATION = OrganizationId.of(uuidFor(2));
const NEW_PASSWORD = 'outra-senha-bem-segura-2';

/** Rotas só de teste: provam o comportamento do guard global sem depender de nenhum módulo de negócio. */
@Controller('probe')
class ProbeController {
  @Get('closed')
  closed(@CurrentContext() context: RequestContext) {
    return { organizationId: context.organizationId, actorId: context.actorId };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }

  @RequirePermission('finance:read')
  @Get('finance')
  finance() {
    return { ok: true };
  }

  @RequirePermission('finance:read', { organizationWide: true })
  @Get('finance-all')
  financeAll() {
    return { ok: true };
  }
}

const running: HttpTestApp[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close()));
});

async function startApp() {
  const app = await startHttpTestApp({ controllers: [ProbeController] });
  running.push(app);
  return app;
}

type Running = HttpTestApp;

const login = (running: Running, email = EMAIL, password = PASSWORD) =>
  request(running.server).post('/auth/login').send({ email, password });

/** O par `nome=valor` do cookie de renovação, como o navegador o devolveria. */
function refreshCookieOf(response: request.Response): string {
  const header = [response.headers['set-cookie']].flat().join('\n');
  const match = /refresh_token=([^;]*)/.exec(header);
  if (!match) throw new Error('A resposta não definiu o cookie de renovação.');
  return `refresh_token=${match[1]}`;
}

async function loggedIn(running: Running, email = EMAIL) {
  const response = await login(running, email).expect(200);
  return {
    accessToken: response.body.accessToken as string,
    cookie: refreshCookieOf(response),
    response,
  };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('POST /auth/login', () => {
  it('entra: devolve o token de acesso e o usuário, e põe o de renovação SÓ no cookie', async () => {
    const running = await startApp();

    const response = await login(running);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessToken: expect.any(String),
      accessTokenExpiresAt: new Date(NOW.getTime() + 900_000).toISOString(),
      user: {
        id: running.admin.userId,
        organizationId: ORGANIZATION,
        email: EMAIL,
        roles: [{ roleName: 'Administrador', isSystem: true }],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('refresh');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('o cookie de renovação é HttpOnly, SameSite=Strict, Secure, restrito a /auth e com validade', async () => {
    const running = await startApp();

    const response = await login(running);
    const cookie = [response.headers['set-cookie']].flat().join('\n');

    expect(cookie).toMatch(/^refresh_token=[\w-]{40,}/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/Path=\/auth(;|$)/);
    expect(cookie).toMatch(/Expires=/);
  });

  it('senha errada e e-mail inexistente respondem 401 IDÊNTICOS, sem cookie', async () => {
    const running = await startApp();

    const wrongPassword = await login(running, EMAIL, 'senha-errada-qualquer');
    const unknownEmail = await login(running, 'ninguem@igreja.com');

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        code: 'identity.invalid_credentials',
        detail: 'E-mail ou senha incorretos.',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(wrongPassword.body.detail).toBe(unknownEmail.body.detail);
  });

  it('corpo malformado: 400 que aponta o campo e não repete a senha enviada', async () => {
    const running = await startApp();

    const response = await request(running.server)
      .post('/auth/login')
      .send({ email: EMAIL, password: 12345 });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([
      { path: 'password', message: expect.any(String) },
    ]);
    expect(response.text).not.toContain('12345');
  });

  it('5 senhas erradas bloqueiam a conta: nem a senha certa entra depois', async () => {
    const running = await startApp();

    for (let i = 0; i < 5; i += 1) await login(running, EMAIL, 'errada-demais');
    const response = await login(running);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('identity.invalid_credentials');
  });

  it('limite por IP no login: a 11ª tentativa em um minuto recebe 429', async () => {
    const running = await startApp();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await login(running, 'x@igreja.com', 'qualquer')).status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });
});

describe('guard global (nega por padrão)', () => {
  it('rota sem marcação exige login: sem cabeçalho, 401', async () => {
    const running = await startApp();

    const response = await request(running.server).get('/probe/closed');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('identity.session_invalid');
    expect(response.headers['content-type']).toMatch(/problem\+json/);
  });

  it.each([
    ['token que não é JWT', 'Bearer lixo'],
    ['esquema diferente de Bearer', 'Basic YWRtaW46c2VuaGE='],
    ['Bearer sem token', 'Bearer '],
    ['dois tokens', 'Bearer a b'],
  ])('%s: 401', async (_nome, header) => {
    const running = await startApp();

    const response = await request(running.server)
      .get('/probe/closed')
      .set('Authorization', header);

    expect(response.status).toBe(401);
  });

  it('com token válido, entra; a igreja e o usuário vêm do TOKEN, nunca da requisição', async () => {
    const running = await startApp();
    const { accessToken } = await loggedIn(running);

    const response = await request(running.server)
      .get('/probe/closed')
      .query({ organizationId: OTHER_ORGANIZATION })
      .set({ ...bearer(accessToken), 'X-Organization-Id': OTHER_ORGANIZATION });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      organizationId: ORGANIZATION,
      actorId: running.admin.userId,
    });
  });

  it('o token vence em 15 minutos', async () => {
    const running = await startApp();
    const { accessToken } = await loggedIn(running);

    running.clock.advance(899_000);
    const stillValid = await request(running.server)
      .get('/probe/closed')
      .set(bearer(accessToken));
    running.clock.advance(2_000);
    const expired = await request(running.server)
      .get('/probe/closed')
      .set(bearer(accessToken));

    expect(stillValid.status).toBe(200);
    expect(expired.status).toBe(401);
  });

  it('@Public() libera a rota sem login', async () => {
    const running = await startApp();

    const response = await request(running.server).get('/probe/open');

    expect(response.status).toBe(200);
  });

  it('um token válido de usuário desativado, inexistente ou de OUTRA igreja é 401, não 404', async () => {
    const running = await startApp();
    const disabled = await running.addUser(1, { status: 'DISABLED' });
    const sign = async (userId: string, organizationId: string) =>
      (
        await running.signer.sign(
          {
            userId: UserId.of(userId),
            organizationId: OrganizationId.of(organizationId),
            sessionId: SessionId.of(uuidFor(77)),
          },
          NOW,
        )
      ).token;

    const tokens = [
      await sign(disabled.id, ORGANIZATION),
      await sign(uuidFor(999), ORGANIZATION),
      await sign(running.admin.userId, OTHER_ORGANIZATION),
    ];

    for (const token of tokens) {
      const response = await request(running.server)
        .get('/probe/closed')
        .set(bearer(token));
      expect(response.status).toBe(401);
      expect(response.body.code).toBe('identity.session_invalid');
    }
  });

  describe('@RequirePermission', () => {
    it('administrador (permissão curinga) passa', async () => {
      const running = await startApp();
      const { accessToken } = await loggedIn(running);

      const response = await request(running.server)
        .get('/probe/finance')
        .set(bearer(accessToken));

      expect(response.status).toBe(200);
    });

    it('quem tem a permissão passa; quem tem outra ou nenhuma recebe 403', async () => {
      const running = await startApp();
      const treasurer = await running.addUser(1, {
        permissions: ['finance:read'],
      });
      const secretary = await running.addUser(2, {
        permissions: ['members:read'],
      });
      const nobody = await running.addUser(3);

      const statusFor = async (email: string) => {
        const { accessToken } = await loggedIn(running, email);
        return request(running.server)
          .get('/probe/finance')
          .set(bearer(accessToken));
      };

      expect((await statusFor(treasurer.email)).status).toBe(200);
      for (const user of [secretary, nobody]) {
        const response = await statusFor(user.email);
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('identity.permission_denied');
      }
    });
  });
});

describe('@RequirePermission com organizationWide', () => {
  it('papel só de UMA congregação passa na checagem comum, mas não na que exige a igreja toda', async () => {
    const running = await startApp();
    const leader = await running.addUser(1, {
      permissions: ['finance:read'],
      congregationId: CongregationId.of(uuidFor(900)),
    });
    const { accessToken } = await loggedIn(running, leader.email);

    const anyScope = await request(running.server)
      .get('/probe/finance')
      .set(bearer(accessToken));
    const wholeChurch = await request(running.server)
      .get('/probe/finance-all')
      .set(bearer(accessToken));

    expect(anyScope.status).toBe(200);
    expect(wholeChurch.status).toBe(403);
    expect(wholeChurch.body.code).toBe('identity.permission_denied');
  });

  it('papel da igreja toda passa; o administrador também', async () => {
    const running = await startApp();
    const treasurer = await running.addUser(1, {
      permissions: ['finance:read'],
    });
    const tokens = [
      (await loggedIn(running, treasurer.email)).accessToken,
      (await loggedIn(running)).accessToken,
    ];

    for (const token of tokens) {
      const response = await request(running.server)
        .get('/probe/finance-all')
        .set(bearer(token));
      expect(response.status).toBe(200);
    }
  });
});

describe('GET /auth/me', () => {
  it('devolve o usuário logado, sem nada de segurança', async () => {
    const running = await startApp();
    const { accessToken } = await loggedIn(running);

    const response = await request(running.server)
      .get('/auth/me')
      .set(bearer(accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: running.admin.userId,
      organizationId: ORGANIZATION,
      email: EMAIL,
      roles: [
        {
          roleId: running.admin.roleId,
          roleName: 'Administrador',
          isSystem: true,
          congregationId: null,
        },
      ],
    });
    expect(response.text).not.toMatch(/hash|argon|password/i);
  });

  it('sem login, 401', async () => {
    const running = await startApp();

    expect((await request(running.server).get('/auth/me')).status).toBe(401);
  });
});

describe('POST /auth/refresh', () => {
  it('troca o cookie por outro e devolve um token de acesso novo', async () => {
    const running = await startApp();
    const { cookie } = await loggedIn(running);
    running.clock.advance(60_000);

    const response = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: expect.any(String),
      accessTokenExpiresAt: new Date(NOW.getTime() + 960_000).toISOString(),
    });
    expect(refreshCookieOf(response)).not.toBe(cookie);
    expect(response.headers['cache-control']).toBe('no-store');
    const me = await request(running.server)
      .get('/auth/me')
      .set(bearer(response.body.accessToken));
    expect(me.status).toBe(200);
  });

  it('o cookie é encontrado mesmo entre outros cookies', async () => {
    const running = await startApp();
    const { cookie } = await loggedIn(running);

    const response = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', `tema=escuro; ${cookie}; outro=1`);

    expect(response.status).toBe(200);
  });

  it('reapresentar um cookie já trocado é roubo: 401 e a família inteira cai', async () => {
    const running = await startApp();
    const { cookie: stolen } = await loggedIn(running);
    const legit = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', stolen)
      .expect(200);

    const reuse = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', stolen);
    const legitAfter = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', refreshCookieOf(legit));

    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('identity.session_reuse_detected');
    expect(legitAfter.status).toBe(401);
    expect(legitAfter.body.code).toBe('identity.session_invalid');
  });

  it('um cookie que não serve mais é apagado na resposta', async () => {
    const running = await startApp();

    const response = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', 'refresh_token=lixo-que-nao-existe');

    expect(response.status).toBe(401);
    const cleared = [response.headers['set-cookie']].flat().join('\n');
    expect(cleared).toMatch(/^refresh_token=;/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared).toMatch(/Path=\/auth/);
  });

  it('sem cookie, 401', async () => {
    const running = await startApp();

    const response = await request(running.server).post('/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('identity.session_invalid');
  });
});

describe('POST /auth/logout', () => {
  it('encerra a sessão: 204, apaga o cookie e o cookie antigo não renova mais', async () => {
    const running = await startApp();
    const { cookie } = await loggedIn(running);

    const response = await request(running.server)
      .post('/auth/logout')
      .set('Cookie', cookie);
    const afterwards = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', cookie);

    expect(response.status).toBe(204);
    expect([response.headers['set-cookie']].flat().join('\n')).toMatch(
      /^refresh_token=;/,
    );
    expect(afterwards.status).toBe(401);
  });

  it('é idempotente: sem cookie ou com cookie desconhecido, também 204', async () => {
    const running = await startApp();

    const without = await request(running.server).post('/auth/logout');
    const unknown = await request(running.server)
      .post('/auth/logout')
      .set('Cookie', 'refresh_token=desconhecido');

    expect(without.status).toBe(204);
    expect(unknown.status).toBe(204);
  });
});

describe('POST /auth/change-password', () => {
  it('troca a senha, mantém ESTE dispositivo e derruba os outros', async () => {
    const running = await startApp();
    const here = await loggedIn(running);
    const elsewhere = await loggedIn(running);

    const response = await request(running.server)
      .post('/auth/change-password')
      .set(bearer(here.accessToken))
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(204);
    const hereRefresh = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', here.cookie);
    const elsewhereRefresh = await request(running.server)
      .post('/auth/refresh')
      .set('Cookie', elsewhere.cookie);
    expect(hereRefresh.status).toBe(200);
    expect(elsewhereRefresh.status).toBe(401);
    expect((await login(running)).status).toBe(401);
    expect((await login(running, EMAIL, NEW_PASSWORD)).status).toBe(200);
  });

  it('senha atual errada: 422 (e não 401, para a web não deslogar a pessoa)', async () => {
    const running = await startApp();
    const { accessToken } = await loggedIn(running);

    const response = await request(running.server)
      .post('/auth/change-password')
      .set(bearer(accessToken))
      .send({ currentPassword: 'nao-e-a-senha', newPassword: NEW_PASSWORD });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('identity.current_password_incorrect');
  });

  it('senha nova fora da política: 422 de regra de domínio', async () => {
    const running = await startApp();
    const { accessToken } = await loggedIn(running);

    const response = await request(running.server)
      .post('/auth/change-password')
      .set(bearer(accessToken))
      .send({ currentPassword: PASSWORD, newPassword: 'curta' });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('validation.invalid_value');
    expect(response.text).not.toContain('curta');
  });

  it('exige login', async () => {
    const running = await startApp();

    const response = await request(running.server)
      .post('/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(response.status).toBe(401);
  });
});
