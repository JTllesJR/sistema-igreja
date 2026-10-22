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

    it('replacePermissions troca TODO o conjunto de permissões, sem tocar nos outros papéis', async () => {
      await repository.add(treasurer(2, 1));
      await repository.add(treasurer(3, 2));

      await repository.replacePermissions(roleId(2), [
        Permission.of('finance:read'),
        Permission.of('finance:write'),
        Permission.of('finance:write'),
      ]);

      const changed = (await repository.findByIds([roleId(2)]))[0];
      const untouched = (await repository.findByIds([roleId(3)]))[0];
      expect(changed && snapshot(changed)).toEqual({
        ...snapshot(treasurer(2, 1)),
        permissions: ['finance:read', 'finance:write'],
      });
      expect(untouched && snapshot(untouched)).toEqual(
        snapshot(treasurer(3, 2)),
      );
    });

    it('replacePermissions de um papel que não existe não faz nada', async () => {
      await expect(
        repository.replacePermissions(roleId(99), [Permission.of('x:y')]),
      ).resolves.toBeUndefined();
      await expect(repository.findByIds([roleId(99)])).resolves.toEqual([]);
    });

    const custom = (id: number, organization: number, name: string) =>
      Role.custom({
        id: roleId(id),
        organizationId: orgId(organization),
        name: RoleName.create(name),
        permissions: [Permission.of('members:read')],
      });

    it('save grava nome e permissões juntos, sem tocar nos outros papéis', async () => {
      await repository.add(custom(2, 1, 'Missões'));
      await repository.add(custom(3, 1, 'Louvor'));

      const edited = custom(2, 1, 'Missões').edit({
        name: RoleName.create('Missões e Evangelismo'),
        permissions: [
          Permission.of('members:write'),
          Permission.of('organization:read'),
        ],
      });
      await repository.save(edited);

      const [changed] = await repository.findByIds([roleId(2)]);
      const [untouched] = await repository.findByIds([roleId(3)]);
      expect(changed && snapshot(changed)).toEqual(snapshot(edited));
      expect(untouched && snapshot(untouched)).toEqual(
        snapshot(custom(3, 1, 'Louvor')),
      );
    });

    it('save com o nome de OUTRO papel da igreja é recusado (sem caixa) e não grava nada; o próprio nome pode', async () => {
      await repository.add(custom(2, 1, 'Missões'));
      await repository.add(custom(3, 1, 'Louvor'));

      await expect(
        repository.save(
          custom(2, 1, 'Missões').edit({
            name: RoleName.create('LOUVOR'),
            permissions: [Permission.of('finance:read')],
          }),
        ),
      ).rejects.toBeInstanceOf(RoleNameAlreadyInUseError);
      const [kept] = await repository.findByIds([roleId(2)]);
      expect(kept && snapshot(kept)).toEqual(snapshot(custom(2, 1, 'Missões')));

      await expect(
        repository.save(custom(2, 1, 'MISSÕES')),
      ).resolves.toBeUndefined();
    });

    it('save não alcança papel de OUTRA igreja nem papel inexistente', async () => {
      await repository.add(custom(2, 1, 'Missões'));

      await repository.save(custom(2, 2, 'Invadido'));
      await repository.save(custom(99, 1, 'Fantasma'));

      const [kept] = await repository.findByIds([roleId(2)]);
      expect(kept?.name.value).toBe('Missões');
      await expect(repository.findByIds([roleId(99)])).resolves.toEqual([]);
    });

    it('remove exclui o papel daquela igreja; de outra igreja ou inexistente é ignorado', async () => {
      await repository.add(custom(2, 1, 'Missões'));
      await repository.add(custom(3, 2, 'Missões'));

      await repository.remove(orgId(2), roleId(2));
      await expect(repository.findByIds([roleId(2)])).resolves.toHaveLength(1);

      await repository.remove(orgId(1), roleId(2));
      await repository.remove(orgId(1), roleId(99));
      await expect(repository.findByIds([roleId(2)])).resolves.toEqual([]);
      await expect(repository.findByIds([roleId(3)])).resolves.toHaveLength(1);
    });
  });
}
