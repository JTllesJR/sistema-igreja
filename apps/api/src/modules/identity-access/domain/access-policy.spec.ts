import { describe, expect, it } from 'vitest';
import { AccessPolicy } from './access-policy.js';
import { Permission } from './permission.js';
import { Role } from './role.js';
import { RoleAssignment } from './role-assignment.js';
import { RoleName } from './role-name.js';
import { congId, orgId, roleId } from './testing/fixtures.js';

const administrator = Role.administrator({
  id: roleId(1),
  organizationId: orgId(),
});
const treasurer = Role.restore({
  id: roleId(2),
  organizationId: orgId(),
  name: RoleName.create('Tesoureiro'),
  isSystem: false,
  permissions: [Permission.of('finance:read'), Permission.of('finance:create')],
});
const secretary = Role.restore({
  id: roleId(3),
  organizationId: orgId(),
  name: RoleName.create('Secretário'),
  isSystem: false,
  permissions: [Permission.of('members:read')],
});
const roles = [administrator, treasurer, secretary];

const read = Permission.of('finance:read');
const assign = (
  role: Role,
  congregationId = null as ReturnType<typeof congId> | null,
) => RoleAssignment.create({ roleId: role.id, congregationId });

describe('AccessPolicy', () => {
  describe('sem atribuições', () => {
    const policy = AccessPolicy.from([], roles);

    it('não concede nada', () => {
      expect(policy.hasPermission(read)).toBe(false);
      expect(policy.can(read, congId(1))).toBe(false);
      expect(policy.scopeFor(read)).toEqual({ kind: 'NONE' });
    });
  });

  describe('Administrador na igreja toda', () => {
    const policy = AccessPolicy.from([assign(administrator)], roles);

    it('concede qualquer permissão em qualquer congregação', () => {
      expect(policy.hasPermission(Permission.of('qualquer:coisa'))).toBe(true);
      expect(policy.can(read, congId(1))).toBe(true);
      expect(policy.can(read, congId(99))).toBe(true);
    });

    it('o escopo é a organização inteira', () => {
      expect(policy.scopeFor(read)).toEqual({ kind: 'ORGANIZATION' });
    });
  });

  describe('papel restrito a uma congregação', () => {
    const policy = AccessPolicy.from([assign(treasurer, congId(1))], roles);

    it('concede só naquela congregação', () => {
      expect(policy.hasPermission(read)).toBe(true);
      expect(policy.can(read, congId(1))).toBe(true);
      expect(policy.can(read, congId(2))).toBe(false);
    });

    it('não concede permissões que o papel não tem', () => {
      expect(policy.hasPermission(Permission.of('members:read'))).toBe(false);
      expect(policy.scopeFor(Permission.of('members:read'))).toEqual({
        kind: 'NONE',
      });
    });

    it('o escopo lista a congregação', () => {
      expect(policy.scopeFor(read)).toEqual({
        kind: 'CONGREGATIONS',
        congregationIds: [congId(1)],
      });
    });
  });

  describe('combinação de atribuições', () => {
    it('une as congregações de várias atribuições, sem repetir', () => {
      const policy = AccessPolicy.from(
        [
          assign(treasurer, congId(1)),
          assign(treasurer, congId(2)),
          assign(secretary, congId(1)),
        ],
        roles,
      );

      expect(policy.scopeFor(read)).toEqual({
        kind: 'CONGREGATIONS',
        congregationIds: [congId(1), congId(2)],
      });
      expect(policy.scopeFor(Permission.of('members:read'))).toEqual({
        kind: 'CONGREGATIONS',
        congregationIds: [congId(1)],
      });
    });

    it('a atribuição para a igreja toda prevalece sobre as restritas', () => {
      const policy = AccessPolicy.from(
        [assign(treasurer, congId(1)), assign(treasurer)],
        roles,
      );

      expect(policy.scopeFor(read)).toEqual({ kind: 'ORGANIZATION' });
      expect(policy.can(read, congId(7))).toBe(true);
    });
  });

  it('papel inexistente na lista não concede nada (falha fechada)', () => {
    const policy = AccessPolicy.from([assign(administrator)], []);

    expect(policy.hasPermission(read)).toBe(false);
    expect(policy.scopeFor(read)).toEqual({ kind: 'NONE' });
  });
});
