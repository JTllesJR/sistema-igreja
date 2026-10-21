import { describe, expect, it } from 'vitest';
import { AccessPolicy, Permission } from '../../../identity-access/index.js';
import { Role } from '../../../identity-access/domain/role.js';
import { RoleAssignment } from '../../../identity-access/domain/role-assignment.js';
import { RoleName } from '../../../identity-access/domain/role-name.js';
import { congId, orgId } from '../../domain/testing/fixtures.js';
import { memberAccessFrom } from './member-access.factory.js';
import { RoleId } from '../../../identity-access/domain/ids.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';

const role = (n: number, permissions: string[]) =>
  Role.restore({
    id: RoleId.of(uuidFor(7000 + n)),
    organizationId: orgId(),
    name: RoleName.create(`Papel ${n}`),
    isSystem: false,
    permissions: permissions.map((p) => Permission.of(p)),
  });

const policyOf = (
  ...grants: { permissions: string[]; congregation?: number }[]
) => {
  const roles = grants.map((g, i) => role(i, g.permissions));
  return AccessPolicy.from(
    grants.map((g, i) =>
      RoleAssignment.create({
        roleId: roles[i]!.id,
        congregationId:
          g.congregation === undefined ? null : congId(g.congregation),
      }),
    ),
    roles,
  );
};

describe('memberAccessFrom (política de acesso -> o que os casos de uso precisam)', () => {
  it('leitura da igreja toda: sem restrição de congregação', () => {
    const access = memberAccessFrom(
      policyOf({ permissions: ['members:read'] }),
    );

    expect(access.readableCongregations()).toBeNull();
    expect(access.canRead(congId(1))).toBe(true);
    expect(access.canRead(congId(99))).toBe(true);
  });

  it('leitura de uma congregação: só ela, e a lista a acompanha', () => {
    const access = memberAccessFrom(
      policyOf({ permissions: ['members:read'], congregation: 1 }),
    );

    expect(access.readableCongregations()).toEqual([congId(1)]);
    expect(access.canRead(congId(1))).toBe(true);
    expect(access.canRead(congId(2))).toBe(false);
  });

  it('sem nenhuma permissão de leitura: lista vazia (nenhuma congregação), nunca "tudo"', () => {
    const access = memberAccessFrom(
      policyOf({ permissions: ['members:write'], congregation: 1 }),
    );

    expect(access.readableCongregations()).toEqual([]);
  });

  it('ler e escrever são independentes', () => {
    const access = memberAccessFrom(
      policyOf(
        { permissions: ['members:read'] },
        { permissions: ['members:write'], congregation: 2 },
      ),
    );

    expect(access.canRead(congId(1))).toBe(true);
    expect(access.canWrite(congId(1))).toBe(false);
    expect(access.canWrite(congId(2))).toBe(true);
    expect(access.canRead(congId(2))).toBe(true);
  });

  it('anonimizar exige a permissão para a IGREJA TODA: por congregação não vale', () => {
    const scoped = memberAccessFrom(
      policyOf({ permissions: ['members:anonymize'], congregation: 1 }),
    );
    const whole = memberAccessFrom(
      policyOf({ permissions: ['members:anonymize'] }),
    );
    const none = memberAccessFrom(policyOf({ permissions: ['members:read'] }));

    expect(scoped.canAnonymize()).toBe(false);
    expect(whole.canAnonymize()).toBe(true);
    expect(none.canAnonymize()).toBe(false);
  });

  it('o curinga do Administrador concede tudo, na igreja toda', () => {
    const access = memberAccessFrom(policyOf({ permissions: ['*'] }));

    expect(access.readableCongregations()).toBeNull();
    expect(access.canWrite(congId(5))).toBe(true);
    expect(access.canAnonymize()).toBe(true);
  });
});
