import { describe, expect, it } from 'vitest';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { AUDIT_READ } from '../../../audit/audit.permissions.js';
import {
  FINANCE_APPROVE,
  FINANCE_READ,
} from '../../../finance/finance.permissions.js';
import { ACCESS_MANAGE_USERS } from '../../access.permissions.js';
import { AccessPolicy } from '../../domain/access-policy.js';
import { RoleId } from '../../domain/ids.js';
import { Permission } from '../../domain/permission.js';
import { RoleAssignment } from '../../domain/role-assignment.js';
import { RoleName } from '../../domain/role-name.js';
import { Role } from '../../domain/role.js';
import { congId, orgId } from '../../domain/testing/fixtures.js';
import {
  DIRECTORY_PERMISSIONS,
  userDirectoryAccessFrom,
} from './user-directory-access.factory.js';

const policyOf = (permissions: string[], congregation?: number) => {
  const role = Role.restore({
    id: RoleId.of(uuidFor(9500)),
    organizationId: orgId(),
    name: RoleName.create('Papel de teste'),
    isSystem: false,
    permissions: permissions.map((p) => Permission.of(p)),
  });
  return AccessPolicy.from(
    [
      RoleAssignment.create({
        roleId: role.id,
        congregationId:
          congregation === undefined ? null : congId(congregation),
      }),
    ],
    [role],
  );
};

describe('userDirectoryAccessFrom (ADR 0020)', () => {
  it('os textos batem com as constantes dos módulos dono (se alguém renomear uma permissão, este teste falha)', () => {
    expect([...DIRECTORY_PERMISSIONS].sort()).toEqual(
      [FINANCE_READ, FINANCE_APPROVE, AUDIT_READ, ACCESS_MANAGE_USERS].sort(),
    );
  });

  it.each([...DIRECTORY_PERMISSIONS])(
    'basta UMA das permissões que mostram ids: %s',
    (permission) => {
      expect(userDirectoryAccessFrom(policyOf([permission])).canResolve()).toBe(
        true,
      );
    },
  );

  it('vale em qualquer escopo: o Tesoureiro de uma congregação resolve quem pediu', () => {
    expect(
      userDirectoryAccessFrom(policyOf(['finance:read'], 1)).canResolve(),
    ).toBe(true);
  });

  it('o curinga do Administrador resolve', () => {
    expect(userDirectoryAccessFrom(policyOf(['*'])).canResolve()).toBe(true);
  });

  it('quem só tem outras permissões (membros, congregações, lançar) não resolve', () => {
    const access = userDirectoryAccessFrom(
      policyOf([
        'members:read',
        'members:write',
        'organization:read',
        'finance:write',
        'finance:read-individual',
      ]),
    );

    expect(access.canResolve()).toBe(false);
  });
});
