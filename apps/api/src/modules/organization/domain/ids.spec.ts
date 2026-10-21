import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { CongregationId, OrganizationId } from './ids.js';

const UUID_V7 = '0199c0a4-7b3e-7c11-8f2a-5d6e7f8a9b0c';

describe.each([
  ['OrganizationId', OrganizationId],
  ['CongregationId', CongregationId],
])('%s', (_nome, Id) => {
  it('aceita um UUID e o devolve inalterado', () => {
    expect(Id.of(UUID_V7)).toBe(UUID_V7);
  });

  it('rejeita texto que não é UUID', () => {
    const error = thrownBy(() => Id.of('123'));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'id' });
  });

  it('rejeita string vazia', () => {
    expect(() => Id.of('')).toThrow(ValidationError);
  });
});
