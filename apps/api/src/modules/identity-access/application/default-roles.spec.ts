import { describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { RoleNameAlreadyInUseError } from '../domain/errors.js';
import { Permission } from '../domain/permission.js';
import { RoleName } from '../domain/role-name.js';
import { Role } from '../domain/role.js';
import type { RoleRepository } from '../domain/role.repository.js';
import { RoleId } from '../domain/ids.js';
import { InMemoryRoleRepository } from '../domain/testing/in-memory-role.repository.js';
import { ensureDefaultRoles } from './default-roles.js';

const ORG_A = OrganizationId.of(uuidFor(1));
const ORG_B = OrganizationId.of(uuidFor(2));

function setup() {
  return {
    roles: new InMemoryRoleRepository(),
    ids: new SequentialIdGenerator(900_000),
  };
}

const namesOf = async (roles: RoleRepository, org: OrganizationId) =>
  (await roles.listByOrganization(org)).map((r) => r.name.value).sort();

describe('ensureDefaultRoles (ADR 0014)', () => {
  it('numa igreja sem papéis, cria os cinco papéis padrão e os devolve', async () => {
    const { roles, ids } = setup();

    const result = await ensureDefaultRoles(roles, ids, ORG_A);

    expect(result.administrator.name.value).toBe('Administrador');
    expect(result.leader.name.value).toBe('Dirigente');
    expect(result.secretary.name.value).toBe('Secretário');
    expect(result.treasurer.name.value).toBe('Tesoureiro');
    expect(result.board.name.value).toBe('Diretoria');
    expect(await namesOf(roles, ORG_A)).toEqual([
      'Administrador',
      'Diretoria',
      'Dirigente',
      'Secretário',
      'Tesoureiro',
    ]);
    for (const role of Object.values(result)) {
      expect(role.organizationId).toBe(ORG_A);
      expect(role.isSystem).toBe(true);
    }
  });

  it('é idempotente: chamar de novo devolve os mesmos papéis, sem criar nenhum e sem gastar ids', async () => {
    const { roles, ids } = setup();
    const first = await ensureDefaultRoles(roles, ids, ORG_A);
    let idsRequested = 0;
    const counting = {
      next: () => {
        idsRequested += 1;
        return ids.next();
      },
    };

    const second = await ensureDefaultRoles(roles, counting, ORG_A);

    expect(second.administrator.id).toBe(first.administrator.id);
    expect(second.leader.id).toBe(first.leader.id);
    expect(second.secretary.id).toBe(first.secretary.id);
    expect(await roles.listByOrganization(ORG_A)).toHaveLength(5);
    expect(idsRequested).toBe(0);
  });

  it('cria só o que falta (igreja que já tinha apenas o Administrador)', async () => {
    const { roles, ids } = setup();
    const admin = Role.administrator({
      id: RoleId.of(uuidFor(777)),
      organizationId: ORG_A,
    });
    await roles.add(admin);

    const result = await ensureDefaultRoles(roles, ids, ORG_A);

    expect(result.administrator.id).toBe(admin.id);
    expect(await roles.listByOrganization(ORG_A)).toHaveLength(5);
  });

  it('não mexe em papéis personalizados da igreja', async () => {
    const { roles, ids } = setup();
    await roles.add(
      Role.restore({
        id: RoleId.of(uuidFor(778)),
        organizationId: ORG_A,
        name: RoleName.create('Auxiliar financeiro'),
        isSystem: false,
        permissions: [Permission.of('finance:read')],
      }),
    );

    await ensureDefaultRoles(roles, ids, ORG_A);

    expect(await namesOf(roles, ORG_A)).toEqual([
      'Administrador',
      'Auxiliar financeiro',
      'Diretoria',
      'Dirigente',
      'Secretário',
      'Tesoureiro',
    ]);
  });

  it('cada igreja tem os seus papéis, com ids próprios', async () => {
    const { roles, ids } = setup();

    const a = await ensureDefaultRoles(roles, ids, ORG_A);
    const b = await ensureDefaultRoles(roles, ids, ORG_B);

    expect(b.administrator.id).not.toBe(a.administrator.id);
    expect(b.administrator.organizationId).toBe(ORG_B);
    expect(await roles.listByOrganization(ORG_A)).toHaveLength(5);
    expect(await roles.listByOrganization(ORG_B)).toHaveLength(5);
  });

  it('se outra chamada criou o mesmo papel no meio do caminho, relê e usa o dela (corrida)', async () => {
    const { roles, ids } = setup();
    const winner = Role.secretary({
      id: RoleId.of(uuidFor(779)),
      organizationId: ORG_A,
    });
    // Simula a corrida: no instante em que esta chamada tenta criar o Secretário, o concorrente acaba de criá-lo.
    const racing: RoleRepository = {
      findByIds: (idsToFind) => roles.findByIds(idsToFind),
      findAdministrator: (org) => roles.findAdministrator(org),
      listByOrganization: (org) => roles.listByOrganization(org),
      replacePermissions: (id, p) => roles.replacePermissions(id, p),
      save: (r) => roles.save(r),
      remove: (o, id) => roles.remove(o, id),
      add: async (role) => {
        if (role.name.value === 'Secretário') {
          await roles.add(winner);
          throw new RoleNameAlreadyInUseError(role.name.value);
        }
        await roles.add(role);
      },
    };

    const result = await ensureDefaultRoles(racing, ids, ORG_A);

    expect(result.secretary.id).toBe(winner.id);
    expect(await roles.listByOrganization(ORG_A)).toHaveLength(5);
  });

  it('um erro que não é de nome repetido não é escondido', async () => {
    const { roles, ids } = setup();
    const broken: RoleRepository = {
      findByIds: (x) => roles.findByIds(x),
      findAdministrator: (x) => roles.findAdministrator(x),
      listByOrganization: (x) => roles.listByOrganization(x),
      replacePermissions: (id, p) => roles.replacePermissions(id, p),
      save: (r) => roles.save(r),
      remove: (o, id) => roles.remove(o, id),
      add: () => Promise.reject(new Error('banco fora do ar')),
    };

    await expect(ensureDefaultRoles(broken, ids, ORG_A)).rejects.toThrow(
      'banco fora do ar',
    );
  });

  it('mesmo que o papel já exista (concorrente), só um erro de NOME REPETIDO é tratado como corrida', async () => {
    const { roles, ids } = setup();
    const racing: RoleRepository = {
      findByIds: (x) => roles.findByIds(x),
      findAdministrator: (x) => roles.findAdministrator(x),
      listByOrganization: (x) => roles.listByOrganization(x),
      replacePermissions: (id, p) => roles.replacePermissions(id, p),
      save: (r) => roles.save(r),
      remove: (o, id) => roles.remove(o, id),
      add: async (role) => {
        // Um concorrente criou o MESMO papel E a nossa gravação falhou por outro motivo: não é uma corrida a ignorar.
        await roles.add(
          Role.restore({
            id: RoleId.of(uuidFor(781)),
            organizationId: ORG_A,
            name: role.name,
            isSystem: true,
            permissions: role.permissions,
          }),
        );
        throw new Error('conexão perdida');
      },
    };

    await expect(ensureDefaultRoles(racing, ids, ORG_A)).rejects.toThrow(
      'conexão perdida',
    );
  });

  it('SINCRONIZA as permissões de um papel de sistema que ficou para trás (versão antiga do sistema)', async () => {
    const { roles, ids } = setup();
    const old = Role.restore({
      id: RoleId.of(uuidFor(790)),
      organizationId: ORG_A,
      name: RoleName.create('Dirigente'),
      isSystem: true,
      permissions: [Permission.of('members:read')],
    });
    await roles.add(old);

    const result = await ensureDefaultRoles(roles, ids, ORG_A);

    expect(result.leader.id).toBe(old.id);
    const stored = (await roles.listByOrganization(ORG_A)).find(
      (r) => r.id === old.id,
    );
    expect(stored?.permissions.map((p) => p.value).sort()).toEqual(
      Role.leader({ id: old.id, organizationId: ORG_A })
        .permissions.map((p) => p.value)
        .sort(),
    );
  });

  it('não escreve nada quando as permissões já estão em dia', async () => {
    const { roles, ids } = setup();
    await ensureDefaultRoles(roles, ids, ORG_A);
    let writes = 0;
    const counting: RoleRepository = {
      findByIds: (x) => roles.findByIds(x),
      findAdministrator: (x) => roles.findAdministrator(x),
      listByOrganization: (x) => roles.listByOrganization(x),
      add: (role) => roles.add(role),
      save: (r) => roles.save(r),
      remove: (o, id) => roles.remove(o, id),
      replacePermissions: (id, p) => {
        writes += 1;
        return roles.replacePermissions(id, p);
      },
    };

    await ensureDefaultRoles(counting, ids, ORG_A);

    expect(writes).toBe(0);
  });

  it('NÃO mexe nas permissões de um papel personalizado que tenha o mesmo nome de um padrão', async () => {
    const { roles, ids } = setup();
    const custom = Role.restore({
      id: RoleId.of(uuidFor(791)),
      organizationId: ORG_A,
      name: RoleName.create('Tesoureiro'),
      isSystem: false,
      permissions: [Permission.of('members:read')],
    });
    await roles.add(custom);

    await ensureDefaultRoles(roles, ids, ORG_A);

    const stored = (await roles.listByOrganization(ORG_A)).find(
      (r) => r.id === custom.id,
    );
    expect(stored?.permissions.map((p) => p.value)).toEqual(['members:read']);
  });
});
