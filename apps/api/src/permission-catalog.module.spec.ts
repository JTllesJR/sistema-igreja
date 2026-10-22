import { describe, expect, it } from 'vitest';
import { Role } from './modules/identity-access/domain/role.js';
import {
  orgId,
  roleId,
} from './modules/identity-access/domain/testing/fixtures.js';
import { PERMISSION_DEFINITIONS } from './permission-catalog.module.js';

describe('catálogo de permissões (ADR 0019)', () => {
  const keys = PERMISSION_DEFINITIONS.map((definition) => definition.key);

  it('não repete chave e toda permissão tem descrição', () => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const definition of PERMISSION_DEFINITIONS) {
      expect(definition.description.length, definition.key).toBeGreaterThan(10);
    }
  });

  it('os papéis padrão só usam permissões do catálogo (fora o curinga do Administrador)', () => {
    const input = { id: roleId(1), organizationId: orgId(1) };
    const used = [
      Role.leader(input),
      Role.secretary(input),
      Role.treasurer(input),
      Role.board(input),
    ].flatMap((role) => role.permissions.map((p) => p.value));

    expect(used.filter((key) => !keys.includes(key))).toEqual([]);
  });
});
