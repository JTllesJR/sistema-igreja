import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { Permission } from './permission.js';
import { Role } from './role.js';
import { RoleName } from './role-name.js';
import { orgId, roleId } from './testing/fixtures.js';

describe('RoleName', () => {
  it('apara e reduz espaços', () => {
    expect(RoleName.create('  1º   Tesoureiro ').value).toBe('1º Tesoureiro');
  });

  it.each(['', ' ', 'A', 'a'.repeat(61)])('rejeita "%s"', (raw) => {
    const error = thrownBy(() => RoleName.create(raw));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'name' });
  });
});

describe('Role', () => {
  describe('Administrador', () => {
    const administrator = Role.administrator({
      id: roleId(1),
      organizationId: orgId(),
    });

    it('é um papel de sistema chamado "Administrador" com a permissão curinga', () => {
      expect(administrator.name.value).toBe('Administrador');
      expect(administrator.isSystem).toBe(true);
      expect(administrator.permissions.map((p) => p.value)).toEqual(['*']);
    });

    it('concede qualquer permissão, inclusive as que ainda não existem', () => {
      expect(administrator.grants(Permission.of('finance:approve'))).toBe(true);
      expect(
        administrator.grants(Permission.of('modulo-futuro:acao-nova')),
      ).toBe(true);
    });
  });

  describe('papel com permissões explícitas', () => {
    const treasurer = Role.restore({
      id: roleId(2),
      organizationId: orgId(),
      name: RoleName.create('Tesoureiro'),
      isSystem: false,
      permissions: [
        Permission.of('finance:read'),
        Permission.of('finance:create'),
        Permission.of('finance:read'),
      ],
    });

    it('concede somente o que foi listado', () => {
      expect(treasurer.grants(Permission.of('finance:read'))).toBe(true);
      expect(treasurer.grants(Permission.of('finance:create'))).toBe(true);
      expect(treasurer.grants(Permission.of('members:read'))).toBe(false);
    });

    it('ignora permissões repetidas', () => {
      expect(treasurer.permissions).toHaveLength(2);
    });

    it('não é papel de sistema', () => {
      expect(treasurer.isSystem).toBe(false);
    });
  });
});
