import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ENV } from '../src/platform/config/config.module.js';
import { parseEnv, type Env } from '../src/platform/config/env.js';
import { configureHttpApp } from '../src/platform/http/configure-http-app.js';

let app: NestExpressApplication | undefined;

const ALLOWED_ORIGIN = 'http://localhost:5173';

/** Sobe a aplicação inteira com a mesma configuração HTTP do `main.ts` (`configureHttpApp`). */
async function startApp(envOverrides: Record<string, string> = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(
      parseEnv({
        ...process.env,
        CORS_ORIGINS: ALLOWED_ORIGIN,
        ...envOverrides,
      }),
    )
    .compile();

  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureHttpApp(app, app.get<Env>(ENV));
  await app.init();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('plataforma HTTP (aplicação inteira)', () => {
  describe('erros em application/problem+json', () => {
    it('rota inexistente: 404 no formato padrão, com o mesmo identificador do cabeçalho', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer()).get(
        '/nao-existe',
      );

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(response.body).toMatchObject({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        code: 'http.404',
        detail: 'Recurso não encontrado.',
      });
      expect(response.body.requestId).toBe(response.headers['x-request-id']);
    });

    it('corpo JSON malformado: 400 sem repetir o que foi enviado', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer())
        .post('/nao-existe')
        .set('Content-Type', 'application/json')
        .send('{"password": "senha-que-nao-pode-voltar"');

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(response.text).not.toContain('senha-que-nao-pode-voltar');
    });

    it('corpo acima de 100 kb: 413', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer())
        .post('/nao-existe')
        .send({ texto: 'a'.repeat(101 * 1024) });

      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ code: 'http.413', status: 413 });
    });

    it('corpo de até 100 kb passa do limite (aqui cai no 404 da rota inexistente)', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer())
        .post('/nao-existe')
        .send({ texto: 'a'.repeat(90 * 1024) });

      expect(response.status).toBe(404);
    });

    it('o 503 do health continua com o corpo do contrato (não vira problem+json)', async () => {
      const running = await startApp({
        DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/nope',
      });

      const response = await request(running.getHttpServer()).get('/health');

      expect(response.status).toBe(503);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.body).toEqual({
        status: 'degraded',
        checks: { database: 'down' },
      });
    });
  });

  describe('identificador da requisição', () => {
    it('gera um quando não vem e aproveita o enviado quando tem formato seguro', async () => {
      const running = await startApp();

      const generated = await request(running.getHttpServer()).get('/health');
      const echoed = await request(running.getHttpServer())
        .get('/health')
        .set('X-Request-Id', 'meu-id-1234');

      expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(echoed.headers['x-request-id']).toBe('meu-id-1234');
    });
  });

  describe('cabeçalhos de segurança (helmet)', () => {
    it('envia nosniff, não anuncia o framework e restringe quem pode embutir a API', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer()).get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('origem autorizada: o navegador recebe permissão, com credenciais (cookie)', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer())
        .get('/health')
        .set('Origin', ALLOWED_ORIGIN);

      expect(response.headers['access-control-allow-origin']).toBe(
        ALLOWED_ORIGIN,
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('origem NÃO autorizada: sem Allow-Origin o navegador bloqueia a leitura da resposta', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer())
        .get('/health')
        .set('Origin', 'https://site-malicioso.example');

      // O `cors` repete Allow-Credentials mesmo aqui, mas sem Allow-Origin ele não vale nada: o decisivo é este cabeçalho.
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('sem nenhuma origem configurada, ninguém de fora é autorizado', async () => {
      const running = await startApp({ CORS_ORIGINS: '' });

      const response = await request(running.getHttpServer())
        .get('/health')
        .set('Origin', ALLOWED_ORIGIN);

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('pré-voo (OPTIONS) de origem autorizada é respondido com métodos e cabeçalhos aceitos', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer())
        .options('/health')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(
        ALLOWED_ORIGIN,
      );
      expect(
        response.headers['access-control-allow-methods']?.split(','),
      ).toEqual(['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE']);
      expect(response.headers['access-control-allow-headers']).toBe(
        'Authorization,Content-Type',
      );
      expect(response.headers['access-control-max-age']).toBe('600');
    });

    it('o navegador pode ler o X-Request-Id da resposta', async () => {
      const running = await startApp();

      const response = await request(running.getHttpServer())
        .get('/health')
        .set('Origin', ALLOWED_ORIGIN);

      // Também o Retry-After: o front precisa dele para dizer "tente de novo em N segundos" após um 429.
      expect(response.headers['access-control-expose-headers']).toBe(
        'X-Request-Id,Retry-After',
      );
    });
  });

  describe('limite de taxa', () => {
    it('acima do limite: 429 em problem+json, com Retry-After; dentro dele, tudo normal', async () => {
      const running = await startApp({
        THROTTLE_LIMIT: '3',
        THROTTLE_TTL_SECONDS: '3600',
      });
      const server = running.getHttpServer();

      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push((await request(server).get('/health')).status);
      }
      const blocked = await request(server).get('/health');

      expect(statuses).toEqual([200, 200, 200, 429]);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(blocked.body).toMatchObject({ code: 'http.429', status: 429 });
      // A janela configurada é de 3600 s: o aviso é em segundos (e não em milissegundos) e cobre quase a janela toda.
      const retryAfter = Number(blocked.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(3500);
      expect(retryAfter).toBeLessThanOrEqual(3600);
    });
  });
});
