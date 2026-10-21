import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { IS_PUBLIC_KEY } from '../../platform/http/access-control.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

async function createController(check: HealthService['check']) {
  // Usa o container de DI do Nest de verdade, o que também valida os metadados dos decorators.
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: HealthService, useValue: { check: vi.fn(check) } }],
  }).compile();

  return moduleRef.get(HealthController);
}

/** Resposta falsa: só registra o status definido. */
function fakeResponse() {
  const response = {
    statusCode: undefined as number | undefined,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
  };
  return response;
}

describe('HealthController', () => {
  it('devolve o resultado, sem alterar o status, quando tudo está ok', async () => {
    const controller = await createController(() =>
      Promise.resolve({ status: 'ok', checks: { database: 'up' } }),
    );
    const response = fakeResponse();

    await expect(controller.check(response as never)).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
    expect(response.statusCode).toBeUndefined();
  });

  it('define o status 503 e devolve o corpo do contrato quando está degradado', async () => {
    const controller = await createController(() =>
      Promise.resolve({ status: 'degraded', checks: { database: 'down' } }),
    );
    const response = fakeResponse();

    await expect(controller.check(response as never)).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'down' },
    });
    expect(response.statusCode).toBe(503);
  });
});

describe('acesso', () => {
  it('é @Public(): o guard global não pode exigir login do monitoramento', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
  });
});
