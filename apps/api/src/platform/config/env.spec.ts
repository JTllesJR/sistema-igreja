import { describe, expect, it } from 'vitest';
import { thrownBy } from '../../shared/testing/thrown-by.js';
import { parseEnv } from './env.js';

const SECRET = 'a'.repeat(32);

const validSource = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/igreja',
  JWT_SECRET: SECRET,
};

describe('parseEnv', () => {
  it('aplica valores padrão quando só o obrigatório é informado', () => {
    const env = parseEnv(validSource);

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL: validSource.DATABASE_URL,
      JWT_SECRET: SECRET,
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('converte PORT de texto para número', () => {
    const env = parseEnv({ ...validSource, PORT: '8080' });

    expect(env.PORT).toBe(8080);
  });

  it('falha quando DATABASE_URL não é informada', () => {
    expect(() => parseEnv({ JWT_SECRET: SECRET })).toThrow(/DATABASE_URL/);
  });

  it('falha quando DATABASE_URL não é uma URL postgresql', () => {
    expect(() =>
      parseEnv({ ...validSource, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('falha quando PORT está fora do intervalo válido', () => {
    expect(() => parseEnv({ ...validSource, PORT: '70000' })).toThrow(/PORT/);
  });

  describe('JWT_SECRET (segredo de assinatura dos tokens de acesso)', () => {
    it('é obrigatório', () => {
      expect(() =>
        parseEnv({ DATABASE_URL: validSource.DATABASE_URL }),
      ).toThrow(/JWT_SECRET/);
    });

    it('aceita exatamente 32 caracteres e rejeita 31', () => {
      expect(
        parseEnv({ ...validSource, JWT_SECRET: 'a'.repeat(32) }).JWT_SECRET,
      ).toHaveLength(32);
      expect(() =>
        parseEnv({ ...validSource, JWT_SECRET: 'a'.repeat(31) }),
      ).toThrow(/JWT_SECRET/);
    });

    it('a mensagem de erro nunca repete o valor informado', () => {
      const weak = 'segredo-curto-demais-xyz';

      const error = thrownBy(() =>
        parseEnv({ ...validSource, JWT_SECRET: weak }),
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(weak);
    });
  });

  describe('prazos dos tokens', () => {
    it('converte textos em números', () => {
      const env = parseEnv({
        ...validSource,
        ACCESS_TOKEN_TTL_SECONDS: '600',
        REFRESH_TOKEN_TTL_DAYS: '7',
      });

      expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(600);
      expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
    });

    it.each(['59', '3601', '0', 'abc'])(
      'rejeita ACCESS_TOKEN_TTL_SECONDS=%s (aceita de 60 a 3600)',
      (value) => {
        expect(() =>
          parseEnv({ ...validSource, ACCESS_TOKEN_TTL_SECONDS: value }),
        ).toThrow(/ACCESS_TOKEN_TTL_SECONDS/);
      },
    );

    it.each(['0', '91', '1.5'])(
      'rejeita REFRESH_TOKEN_TTL_DAYS=%s (aceita de 1 a 90, o teto absoluto da sessão)',
      (value) => {
        expect(() =>
          parseEnv({ ...validSource, REFRESH_TOKEN_TTL_DAYS: value }),
        ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
      },
    );
  });
});
