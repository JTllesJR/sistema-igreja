import { describe, expect, it } from 'vitest';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { AccessPolicy, Permission } from '../../../identity-access/index.js';
import { RoleId } from '../../../identity-access/domain/ids.js';
import { RoleAssignment } from '../../../identity-access/domain/role-assignment.js';
import { RoleName } from '../../../identity-access/domain/role-name.js';
import { Role } from '../../../identity-access/domain/role.js';
import { congId, orgId } from '../../domain/testing/fixtures.js';
import { financeAccessFrom } from './finance-access.factory.js';

const role = (n: number, permissions: string[]) =>
  Role.restore({
    id: RoleId.of(uuidFor(8000 + n)),
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

const HQ = congId(1);

describe('financeAccessFrom (política de acesso -> o que os casos de uso precisam)', () => {
  it('leitura da igreja toda: sem restrição de congregação', () => {
    const access = financeAccessFrom(
      policyOf({ permissions: ['finance:read'] }),
    );

    expect(access.readableCongregations()).toBeNull();
    expect(access.canRead(congId(1))).toBe(true);
    expect(access.canRead(congId(99))).toBe(true);
  });

  it('leitura de uma congregação: só ela; sem a permissão, lista vazia — nunca "tudo"', () => {
    const scoped = financeAccessFrom(
      policyOf({ permissions: ['finance:read'], congregation: 2 }),
    );
    const none = financeAccessFrom(
      policyOf({ permissions: ['finance:write'], congregation: 2 }),
    );

    expect(scoped.readableCongregations()).toEqual([congId(2)]);
    expect(scoped.canRead(congId(2))).toBe(true);
    expect(scoped.canRead(congId(1))).toBe(false);
    expect(none.readableCongregations()).toEqual([]);
    expect(none.individualCongregations()).toEqual([]);
  });

  it('ler, lançar, aprovar e ver quem contribuiu são independentes', () => {
    const reader = financeAccessFrom(
      policyOf({ permissions: ['finance:read'] }),
    );
    const writer = financeAccessFrom(
      policyOf({ permissions: ['finance:write'], congregation: 2 }),
    );
    const individual = financeAccessFrom(
      policyOf({ permissions: ['finance:read-individual'], congregation: 2 }),
    );

    expect(reader.canWrite(congId(1))).toBe(false);
    expect(reader.canReadIndividual(congId(1))).toBe(false);
    expect(reader.canApprove(HQ)).toBe(false);
    expect(writer.canWrite(congId(2))).toBe(true);
    expect(writer.canWrite(congId(1))).toBe(false);
    expect(writer.canRead(congId(2))).toBe(false);
    expect(individual.canReadIndividual(congId(2))).toBe(true);
    expect(individual.canReadIndividual(congId(1))).toBe(false);
    expect(individual.individualCongregations()).toEqual([congId(2)]);
    expect(individual.canRead(congId(2))).toBe(false);
  });

  it('APROVAR só vale se o alcance chega à SEDE: filial não, sede e igreja toda sim', () => {
    const branch = financeAccessFrom(
      policyOf({ permissions: ['finance:approve'], congregation: 2 }),
    );
    const headquarters = financeAccessFrom(
      policyOf({ permissions: ['finance:approve'], congregation: 1 }),
    );
    const whole = financeAccessFrom(
      policyOf({ permissions: ['finance:approve'] }),
    );
    const readerOnly = financeAccessFrom(
      policyOf({ permissions: ['finance:read'] }),
    );

    expect(branch.canApprove(HQ)).toBe(false);
    expect(headquarters.canApprove(HQ)).toBe(true);
    expect(whole.canApprove(HQ)).toBe(true);
    expect(readerOnly.canApprove(HQ)).toBe(false);
  });

  it('gerir categorias (da igreja toda) exige escrita na IGREJA TODA: por congregação não vale', () => {
    const scoped = financeAccessFrom(
      policyOf({ permissions: ['finance:write'], congregation: 1 }),
    );
    const whole = financeAccessFrom(
      policyOf({ permissions: ['finance:write'] }),
    );
    const reader = financeAccessFrom(
      policyOf({ permissions: ['finance:read'] }),
    );

    expect(scoped.canManageCategories()).toBe(false);
    expect(whole.canManageCategories()).toBe(true);
    expect(reader.canManageCategories()).toBe(false);
  });

  it('o curinga do Administrador concede tudo, na igreja toda', () => {
    const access = financeAccessFrom(policyOf({ permissions: ['*'] }));

    expect(access.readableCongregations()).toBeNull();
    expect(access.individualCongregations()).toBeNull();
    expect(access.canWrite(congId(5))).toBe(true);
    expect(access.canApprove(HQ)).toBe(true);
    expect(access.canManageCategories()).toBe(true);
  });
});
