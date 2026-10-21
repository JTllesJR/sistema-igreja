import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { PlainPassword } from './plain-password.js';
import { anEmail } from './testing/fixtures.js';

const email = anEmail('maria@igreja.com');

describe('PlainPassword', () => {
  it('aceita senha entre 10 e 128 caracteres e a devolve exatamente como veio', () => {
    expect(PlainPassword.create('correct horse battery', email).reveal()).toBe(
      'correct horse battery',
    );
    expect(PlainPassword.create('a'.repeat(10), email).reveal()).toHaveLength(
      10,
    );
    expect(PlainPassword.create('a'.repeat(128), email).reveal()).toHaveLength(
      128,
    );
  });

  it('não apara espaços: senha é preservada tal como digitada', () => {
    expect(PlainPassword.create('  espaços nas pontas  ', email).reveal()).toBe(
      '  espaços nas pontas  ',
    );
  });

  it.each([['curta'], ['123456789'], ['a'.repeat(129)]])(
    'rejeita senha fora do tamanho permitido (%s...)',
    (raw) => {
      const error = thrownBy(() => PlainPassword.create(raw, email));

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ field: 'password' });
    },
  );

  it('rejeita senha igual ao e-mail, ignorando a caixa', () => {
    const error = thrownBy(() =>
      PlainPassword.create('MARIA@igreja.com', email),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'password' });
  });

  describe('não vaza por descuido em log ou serialização', () => {
    const password = PlainPassword.create('senha-muito-secreta-123', email);

    it('toString oculta o valor', () => {
      expect(String(password)).toBe('[REDACTED]');
    });

    it('JSON oculta o valor', () => {
      expect(JSON.stringify({ password })).not.toContain('senha-muito-secreta');
      expect(JSON.stringify({ password })).toContain('[REDACTED]');
    });

    it('inspect (console.log) oculta o valor', () => {
      expect(inspect(password)).not.toContain('senha-muito-secreta');
      expect(inspect({ nested: { password } })).not.toContain(
        'senha-muito-secreta',
      );
    });
  });
});
