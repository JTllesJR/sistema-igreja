import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { Email } from './email.js';

describe('Email', () => {
  it('normaliza: remove espaços nas pontas e usa minúsculas', () => {
    expect(Email.create('  Joao.Silva@Igreja.COM ').value).toBe(
      'joao.silva@igreja.com',
    );
  });

  it.each([
    'a@b.co',
    'nome.sobrenome+tag@sub.dominio.com.br',
    'maria_1980@igreja-central.org',
  ])('aceita o formato comum "%s"', (raw) => {
    expect(Email.create(raw).value).toBe(raw);
  });

  it.each([
    '',
    '   ',
    'sem-arroba',
    '@semlocal.com',
    'sem-dominio@',
    'a@b',
    'com espaco@b.com',
    'dois@@arrobas.com',
    'a@b..com',
    'a@.com',
    'a@-b.com',
    'a@b-.com',
  ])('rejeita "%s"', (raw) => {
    const error = thrownBy(() => Email.create(raw));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'email' });
  });

  it('rejeita e-mail com mais de 254 caracteres', () => {
    expect(() => Email.create(`${'a'.repeat(250)}@b.co`)).toThrow(
      ValidationError,
    );
  });

  it('compara por valor normalizado', () => {
    expect(
      Email.create('MARIA@igreja.com').equals(
        Email.create(' maria@igreja.com '),
      ),
    ).toBe(true);
    expect(
      Email.create('maria@igreja.com').equals(Email.create('joao@igreja.com')),
    ).toBe(false);
  });
});
