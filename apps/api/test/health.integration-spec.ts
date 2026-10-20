import { healthResponseSchema } from '@igreja/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ENV } from '../src/platform/config/config.module.js';
import { parseEnv } from '../src/platform/config/env.js';

let app: INestApplication | undefined;

/** Sobe a aplicação inteira (AppModule real); `envOverrides` permite simular configurações quebradas. */
async function startApp(envOverrides: Record<string, string> = {}) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, ...envOverrides }))
    .compile();

  app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /health (integração, PostgreSQL real)', () => {
  it('responde 200 e cumpre o contrato quando o banco está acessível', async () => {
    const running = await startApp();

    const response = await request(running.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('responde 503 e cumpre o contrato quando o banco está inacessível', async () => {
    // Porta 1: ninguém escuta, a conexão é recusada imediatamente.
    const running = await startApp({
      DATABASE_URL: 'postgresql://nobody:nobody@127.0.0.1:1/nope',
    });

    const response = await request(running.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'degraded',
      checks: { database: 'down' },
    });
  });
});
