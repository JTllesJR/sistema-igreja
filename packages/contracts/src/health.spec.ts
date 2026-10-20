import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('aceita uma resposta saudável', () => {
    const parsed = healthResponseSchema.safeParse({
      status: 'ok',
      checks: { database: 'up' },
    });

    expect(parsed.success).toBe(true);
  });

  it('rejeita status desconhecido', () => {
    const parsed = healthResponseSchema.safeParse({
      status: 'unknown',
      checks: { database: 'up' },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejeita resposta sem o check do banco', () => {
    const parsed = healthResponseSchema.safeParse({ status: 'ok', checks: {} });

    expect(parsed.success).toBe(false);
  });
});
