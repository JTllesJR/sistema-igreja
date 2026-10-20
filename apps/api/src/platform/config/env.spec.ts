import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const validSource = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/igreja',
};

describe('parseEnv', () => {
  it('aplica valores padrão quando só o obrigatório é informado', () => {
    const env = parseEnv(validSource);

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: validSource.DATABASE_URL,
    });
  });

  it('converte PORT de texto para número', () => {
    const env = parseEnv({ ...validSource, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('falha quando DATABASE_URL não é informada', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('falha quando DATABASE_URL não é uma URL postgresql', () => {
    expect(() => parseEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('falha quando PORT está fora do intervalo válido', () => {
    expect(() => parseEnv({ ...validSource, PORT: '70000' })).toThrow(/PORT/);
  });
});
