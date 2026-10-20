import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../platform/database/prisma.service.js';
import { HealthService } from './health.service.js';

/** Fake mínimo do banco: só o que o HealthService usa. */
function fakeDb(queryRaw: () => Promise<unknown>): PrismaService {
  return { $queryRaw: vi.fn(queryRaw) } as unknown as PrismaService;
}

describe('HealthService', () => {
  it('reporta "ok" quando o banco responde', async () => {
    const service = new HealthService(fakeDb(() => Promise.resolve([{}])));

    await expect(service.check()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up' },
    });
  });

  it('reporta "degraded" quando o banco falha, sem propagar o erro', async () => {
    const service = new HealthService(
      fakeDb(() => Promise.reject(new Error('connection refused'))),
    );

    await expect(service.check()).resolves.toEqual({
      status: 'degraded',
      checks: { database: 'down' },
    });
  });
});
