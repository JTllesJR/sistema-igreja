import { describe, expect, it } from 'vitest';
import {
  createUserRequestSchema,
  roleAssignmentRequestSchema,
  roleSchema,
  MAX_USER_DIRECTORY_IDS,
  temporaryPasswordResponseSchema,
  userDirectoryQuerySchema,
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

describe('createUserRequestSchema', () => {
  const roleId = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

  it('aceita e-mail, papel e escopo (null = igreja toda)', () => {
    expect(
      createUserRequestSchema.safeParse({
        email: 'maria@igreja.com',
        roleId,
        congregationId: null,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['e-mail ausente', { roleId, congregationId: null }],
    ['e-mail vazio', { email: '', roleId, congregationId: null }],
    ['e-mail enorme', { email: 'a'.repeat(300), roleId, congregationId: null }],
    ['papel inválido', { email: 'a@b.com', roleId: 'x', congregationId: null }],
    ['escopo ausente', { email: 'a@b.com', roleId }],
  ])('rejeita %s', (_caso, body) => {
    expect(createUserRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('temporaryPasswordResponseSchema', () => {
  it('traz o usuário e a senha temporária', () => {
    expect(
      temporaryPasswordResponseSchema.safeParse({
        user: validUser,
        temporaryPassword: 'Abcd-Efgh-Jkmn-Pqrs',
      }).success,
    ).toBe(true);
    expect(
      temporaryPasswordResponseSchema.safeParse({ user: validUser }).success,
    ).toBe(false);
  });
});

describe('userDirectoryQuerySchema (ADR 0020)', () => {
  const id = (n: number) =>
    `0198a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

  it('transforma o texto "a,b" na lista de ids (aparando espaços)', () => {
    expect(
      userDirectoryQuerySchema.parse({ ids: `${id(1)}, ${id(2)}` }).ids,
    ).toEqual([id(1), id(2)]);
  });

  it('recusa vazio, id fora do formato e mais ids do que o teto', () => {
    const many = Array.from({ length: MAX_USER_DIRECTORY_IDS + 1 }, (_, n) =>
      id(n),
    ).join(',');

    for (const ids of ['', 'não-é-uuid', `${id(1)},xyz`, many]) {
      expect(
        userDirectoryQuerySchema.safeParse({ ids }).success,
        ids.slice(0, 30),
      ).toBe(false);
    }
    expect(userDirectoryQuerySchema.safeParse({}).success).toBe(false);
  });

  it('aceita exatamente o teto', () => {
    const exact = Array.from({ length: MAX_USER_DIRECTORY_IDS }, (_, n) =>
      id(n),
    ).join(',');

    expect(userDirectoryQuerySchema.safeParse({ ids: exact }).success).toBe(
      true,
    );
  });
});
