import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { OrganizationName } from './organization-name.js';

describe('OrganizationName', () => {
  it('aceita um nome válido', () => {
    expect(OrganizationName.create('Igreja Batista Central').value).toBe(
      'Igreja Batista Central',
    );
  });

  it('remove espaços nas pontas e reduz espaços repetidos', () => {
    expect(
      OrganizationName.create('  Igreja   Batista \t Central ').value,
    ).toBe('Igreja Batista Central');
  });

  it.each(['', '   ', 'A'])(
    'rejeita nome vazio ou curto demais: "%s"',
    (raw) => {
      const error = thrownBy(() => OrganizationName.create(raw));

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ field: 'name' });
    },
  );

  it('rejeita nome com mais de 120 caracteres', () => {
    expect(() => OrganizationName.create('a'.repeat(121))).toThrow(
      ValidationError,
    );
  });

  it('aceita exatamente 120 caracteres', () => {
    expect(OrganizationName.create('a'.repeat(120)).value).toHaveLength(120);
  });

  it('compara por valor', () => {
    const a = OrganizationName.create('Igreja Central');
    const b = OrganizationName.create('  Igreja   Central ');

    expect(a.equals(b)).toBe(true);
    expect(a.equals(OrganizationName.create('Outra Igreja'))).toBe(false);
  });
});
