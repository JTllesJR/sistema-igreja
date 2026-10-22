import { describe, expect, it } from 'vitest';
import { roleSchema } from './access.js';

const valid = {
  id: '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  name: 'Secretário',
  isSystem: true,
  permissions: ['members:read', 'members:write'],
};

describe('roleSchema', () => {
  it('aceita um papel completo', () => {
    expect(roleSchema.parse(valid)).toEqual(valid);
  });

  it('aceita papel sem permissões', () => {
    expect(roleSchema.safeParse({ ...valid, permissions: [] }).success).toBe(
      true,
    );
  });

  it.each([
    ['id que não é UUID', { id: '123' }],
    ['sem nome', { name: undefined }],
    ['isSystem como texto', { isSystem: 'sim' }],
    ['permissions que não é lista', { permissions: 'members:read' }],
  ])('rejeita %s', (_caso, patch) => {
    expect(roleSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});
