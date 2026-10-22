import { beforeEach, describe, expect, it } from 'vitest';
import { RoleNameAlreadyInUseError } from '../errors.js';
import { Permission } from '../permission.js';
import { Role } from '../role.js';
import type { RoleRepository } from '../role.repository.js';
import { RoleName } from '../role-name.js';
import { orgId, roleId } from './fixtures.js';

function snapshot(role: Role) {
  return {
    id: role.id,
    organizationId: role.organizationId,
    name: role.name.value,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p) => p.value).sort(),
  };
}

const treasurer = (id = 2, organization = 1) =>
  Role.restore({
    id: roleId(id),
    organizationId: orgId(organization),
    name: RoleName.create('Tesoureiro'),
    isSystem: false,
    permissions: [
      Permission.of('finance:read'),
      Permission.of('finance:create'),
    ],
  });

/**
 * Contrato que TODA implementação de `RoleRepository` precisa cumprir (em memória e PostgreSQL).
 *
 * Requisitos do ambiente: devem existir as organizações `orgId(1)` e `orgId(2)`.
 * `makeRepository` deve devolver um repositório SEM papéis a cada chamada.
 */
export function describeRoleRepositoryContract(
  label: string,
  makeRepository: () => RoleRepository | Promise<RoleRepository>,
): void {
  describe(`RoleRepository (${label})`, () => {
    let repository: RoleRepository;

    beforeEach(async () => {
      repository = await makeRepository();
    });

    it('add + findByIds devolve os papéis com suas permissões', async () => {
      const admin = Role.administrator({
        id: roleId(1),
        organizationId: orgId(1),
      });
      await repository.add(admin);
      await repository.add(treasurer());

      const found = await repository.findByIds([roleId(1), roleId(2)]);

      expect(
        found.map(snapshot).sort((a, b) => a.id.localeCompare(b.id)),
      ).toEqual(
        [snapshot(admin), snapshot(treasurer())].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      );
    });

    it('findByIds ignora ids desconhecidos e aceita lista vazia', async () => {
      await repository.add(treasurer());

      expect(
        (await repository.findByIds([roleId(2), roleId(99)])).map((r) => r.id),
      ).toEqual([roleId(2)]);
      await expect(repository.findByIds([])).resolves.toEqual([]);
    });

    it('findAdministrator devolve o Administrador daquela organização e null se não houver', async () => {
      await repository.add(
        Role.administrator({ id: roleId(1), organizationId: orgId(1) }),
      );
      await repository.add(treasurer(2, 1));

      expect((await repository.findAdministrator(orgId(1)))?.id).toBe(
        roleId(1),
      );
      await expect(repository.findAdministrator(orgId(2))).resolves.toBeNull();
    });

    it('listByOrganization devolve todos os papéis DA organização, com permissões, e nenhum de outra', async () => {
      const admin = Role.administrator({
        id: roleId(1),
        organizationId: orgId(1),
      });
      await repository.add(admin);
      await repository.add(treasurer(2, 1));
      await repository.add(treasurer(3, 2));

      const found = await repository.listByOrganization(orgId(1));

      expect(
        found.map(snapshot).sort((a, b) => a.id.localeCompare(b.id)),
      ).toEqual([snapshot(admin), snapshot(treasurer(2, 1))]);
      await expect(
        repository.listByOrganization(orgId(2)),
      ).resolves.toHaveLength(1);
    });

    it('listByOrganization de uma organização sem papéis devolve lista vazia', async () => {
      await expect(repository.listByOrganization(orgId(1))).resolves.toEqual(
        [],
      );
    });

    it('add de um nome já usado na mesma organização é rejeitado; em outra organização é aceito', async () => {
      await repository.add(treasurer(2, 1));

      await expect(repository.add(treasurer(3, 1))).rejects.toBeInstanceOf(
        RoleNameAlreadyInUseError,
      );
      await expect(repository.add(treasurer(4, 2))).resolves.toBeUndefined();
    });
  });
}
