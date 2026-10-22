import { describe, expect, it } from 'vitest';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { AccessPolicy, Permission } from '../../../identity-access/index.js';
import { RoleId } from '../../../identity-access/domain/ids.js';
import { RoleAssignment } from '../../../identity-access/domain/role-assignment.js';
import { RoleName } from '../../../identity-access/domain/role-name.js';
import { Role } from '../../../identity-access/domain/role.js';
import { CongregationId } from '../../../../shared/domain/identifiers.js';
import { orgId } from '../../domain/testing/audit-query.contract.js';
import { auditAccessFrom } from './audit-access.factory.js';

const role = (n: number, permissions: string[]) =>
  Role.restore({
    id: RoleId.of(uuidFor(9000 + n)),
    organizationId: orgId(),
    name: RoleName.create(`Papel ${n}`),
    isSystem: false,
    permissions: permissions.map((p) => Permission.of(p)),
  });

const policyOf = (permissions: string[], congregation?: number) => {
  const r = role(1, permissions);
  return AccessPolicy.from(
    [
      RoleAssignment.create({
        roleId: r.id,
        congregationId:
          congregation === undefined
            ? null
            : CongregationId.of(uuidFor(1000 + congregation)),
      }),
    ],
    [r],
  );
};

describe('auditAccessFrom (política de acesso -> o que o caso de uso precisa)', () => {
  it('audit:read na IGREJA TODA permite consultar', () => {
    expect(auditAccessFrom(policyOf(['audit:read'])).canRead()).toBe(true);
  });

  it('audit:read só numa congregação NÃO basta: a trilha é da igreja toda', () => {
    expect(auditAccessFrom(policyOf(['audit:read'], 1)).canRead()).toBe(false);
  });

  it('outras permissões não dão acesso à trilha (nem as sensíveis de membros e finanças)', () => {
    const access = auditAccessFrom(
      policyOf([
        'members:read',
        'finance:read',
        'finance:approve',
        'organization:manage',
      ]),
    );

    expect(access.canRead()).toBe(false);
  });

  it('o curinga do Administrador concede', () => {
    expect(auditAccessFrom(policyOf(['*'])).canRead()).toBe(true);
  });
});
