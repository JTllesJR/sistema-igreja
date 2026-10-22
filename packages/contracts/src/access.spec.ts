import { describe, expect, it } from 'vitest';
import {
  roleAssignmentRequestSchema,
  roleSchema,
  userSummarySchema,
} from './access.js';

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

const validUser = {
  id: '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  email: 'maria@igreja.com',
  status: 'ACTIVE',
  lastLoginAt: '2026-10-21T12:00:00.000Z',
  roles: [
    {
      roleId: '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c',
      roleName: 'Secretário',
      congregationId: null,
    },
  ],
};

describe('userSummarySchema', () => {
  it('aceita um usuário completo, com ou sem último login e papéis', () => {
    expect(userSummarySchema.parse(validUser)).toEqual(validUser);
    expect(
      userSummarySchema.safeParse({
        ...validUser,
        lastLoginAt: null,
        roles: [],
      }).success,
    ).toBe(true);
  });

  it.each([
    ['situação desconhecida', { status: 'BLOCKED' }],
    ['último login que não é data ISO', { lastLoginAt: 'ontem' }],
    [
      'papel com id inválido',
      { roles: [{ roleId: '1', roleName: 'x', congregationId: null }] },
    ],
    ['sem e-mail', { email: undefined }],
  ])('rejeita %s', (_caso, patch) => {
    expect(
      userSummarySchema.safeParse({ ...validUser, ...patch }).success,
    ).toBe(false);
  });

  it('não aceita campos secretos por engano no contrato de saída (strip, não vazamento)', () => {
    const parsed = userSummarySchema.parse({ ...validUser, passwordHash: 'x' });

    expect(parsed).not.toHaveProperty('passwordHash');
  });
});

describe('roleAssignmentRequestSchema', () => {
  const roleId = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
  const congregationId = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';

  it('aceita escopo de congregação ou igreja toda (null)', () => {
    expect(
      roleAssignmentRequestSchema.safeParse({ roleId, congregationId }).success,
    ).toBe(true);
    expect(
      roleAssignmentRequestSchema.safeParse({ roleId, congregationId: null })
        .success,
    ).toBe(true);
  });

  it.each([
    [
      'congregationId ausente (ambíguo: igreja toda tem de ser null explícito)',
      { roleId },
    ],
    ['roleId inválido', { roleId: 'abc', congregationId: null }],
    ['congregationId inválido', { roleId, congregationId: 'abc' }],
  ])('rejeita %s', (_caso, body) => {
    expect(roleAssignmentRequestSchema.safeParse(body).success).toBe(false);
  });
});
