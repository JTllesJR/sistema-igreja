import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
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

describe('HealthController', () => {
  it('devolve o resultado quando tudo está ok', async () => {
    const controller = await createController(() =>
      Promise.resolve({ status: 'ok', checks: { database: 'up' } }),
    );

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('lança 503 com o corpo do contrato quando está degradado', async () => {
    const controller = await createController(() =>
      Promise.resolve({ status: 'degraded', checks: { database: 'down' } }),
    );

    const error = await controller.check().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      status: 'degraded',
      checks: { database: 'down' },
    });
  });
});
