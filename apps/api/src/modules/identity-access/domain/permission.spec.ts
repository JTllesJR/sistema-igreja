import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { Permission } from './permission.js';

describe('Permission', () => {
  it.each([
    '*',
    'organization:manage',
    'finance:approve-entry',
    'members:read',
  ])('aceita "%s"', (raw) => {
    expect(Permission.of(raw).value).toBe(raw);
  });

  it.each([
    '',
    'organization',
    'Organization:Manage',
    ':manage',
    'organization:',
    'a:b:c',
    'organization manage',
    '**',
  ])('rejeita "%s"', (raw) => {
    const error = thrownBy(() => Permission.of(raw));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'permission' });
  });

  describe('covers', () => {
    it('o curinga cobre qualquer permissão', () => {
      expect(Permission.ALL.covers(Permission.of('finance:approve'))).toBe(
        true,
      );
      expect(Permission.ALL.covers(Permission.ALL)).toBe(true);
    });

    it('uma permissão cobre apenas a si mesma', () => {
      const read = Permission.of('members:read');

      expect(read.covers(Permission.of('members:read'))).toBe(true);
      expect(read.covers(Permission.of('members:write'))).toBe(false);
      expect(read.covers(Permission.ALL)).toBe(false);
    });
  });
});
