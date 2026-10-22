import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  RoleInUseError,
  RoleNameAlreadyInUseError,
  RoleNotFoundError,
  SystemRoleImmutableError,
} from '../domain/errors.js';
import { RoleId } from '../domain/ids.js';
import { ensureDefaultRoles } from './default-roles.js';
import {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  UpdateRoleUseCase,
  selectablePermissions,
} from './role-editor.use-cases.js';
import { CONGREGATION, ORGANIZATION, anAuthBed } from './testing/test-bed.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';

const CATALOG = [
  { key: 'members:read', description: 'Ver membros.' },
  { key: 'members:write', description: 'Alterar membros.' },
  { key: 'organization:read', description: 'Ver a igreja.' },
  { key: 'access:manage-users', description: 'Gerir acessos.' },
];

async function setup() {
  const bed = await anAuthBed();
  const create = new CreateRoleUseCase(bed.roles, bed.ids, CATALOG, bed.audit);
  const update = new UpdateRoleUseCase(bed.roles, CATALOG, bed.audit);
  const remove = new DeleteRoleUseCase(bed.roles, bed.users, bed.audit);
  const missions = () =>
    create.execute(bed.adminContext, {
      name: 'Secretário de Missões',
      permissions: ['members:read', 'organization:read'],
    });
  return { bed, create, update, remove, missions };
}

describe('catálogo para o editor', () => {
  it('oferece tudo do catálogo, menos o que é reservado ao Administrador', () => {
    expect(selectablePermissions(CATALOG).map((p) => p.key)).toEqual([
      'members:read',
      'members:write',
      'organization:read',
    ]);
  });
});

describe('CreateRoleUseCase (UC-02)', () => {
  it('cria o papel personalizado, que passa a aparecer na igreja, e audita sem dado pessoal', async () => {
    const { bed, missions } = await setup();

    const view = await missions();

    expect(view).toEqual({
      id: expect.any(String),
      name: 'Secretário de Missões',
      isSystem: false,
      permissions: ['members:read', 'organization:read'],
    });
    const stored = await bed.roles.findByIds([RoleId.of(view.id)]);
    expect(stored[0]?.organizationId).toBe(ORGANIZATION);
    expect(bed.audit.entries).toEqual([
      {
        organizationId: ORGANIZATION,
        actorId: bed.adminContext.actorId,
        action: 'role.created',
        entity: 'role',
        entityId: view.id,
        metadata: { permissions: 'members:read,organization:read' },
      },
    ]);
  });

  it('recusa permissão fora do catálogo, reservada ou nenhuma, sem gravar nem auditar', async () => {
    const { bed, create } = await setup();
    const before = (await bed.roles.listByOrganization(ORGANIZATION)).length;

    for (const permissions of [
      ['members:raed'],
      ['access:manage-users'],
      ['*'],
      [],
    ]) {
      expect(
        await rejectionOf(() =>
          create.execute(bed.adminContext, { name: 'Ajudante', permissions }),
        ),
      ).toBeInstanceOf(ValidationError);
    }
    expect(await bed.roles.listByOrganization(ORGANIZATION)).toHaveLength(
      before,
    );
    expect(bed.audit.entries).toEqual([]);
  });

  it('nome repetido na igreja (sem caixa) ou de papel padrão é recusado', async () => {
    const { bed, create, missions } = await setup();
    await missions();

    expect(
      await rejectionOf(() =>
        create.execute(bed.adminContext, {
          name: 'SECRETÁRIO DE MISSÕES',
          permissions: ['members:read'],
        }),
      ),
    ).toBeInstanceOf(RoleNameAlreadyInUseError);
    expect(
      await rejectionOf(() =>
        create.execute(bed.adminContext, {
          name: 'Tesoureiro',
          permissions: ['members:read'],
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });
});

describe('UpdateRoleUseCase (UC-02)', () => {
  it('troca nome e permissões; campo ausente fica como estava', async () => {
    const { bed, update, missions } = await setup();
    const { id } = await missions();
    bed.audit.entries.length = 0;

    const renamed = await update.execute(bed.adminContext, {
      roleId: id,
      name: 'Missões',
    });
    const regranted = await update.execute(bed.adminContext, {
      roleId: id,
      permissions: ['members:write'],
    });

    expect(renamed.permissions).toEqual(['members:read', 'organization:read']);
    expect(regranted).toMatchObject({
      name: 'Missões',
      permissions: ['members:write'],
    });
    expect(bed.audit.entries.map((e) => e.metadata)).toEqual([
      { renamed: true, permissions: 'members:read,organization:read' },
      { renamed: false, permissions: 'members:write' },
    ]);
  });

  it('papel padrão não se edita (409) e o de outra igreja "não existe" (404)', async () => {
    const { bed, update } = await setup();
    const secretary = await bed.roleNamed('Secretário');
    const other = OrganizationId.of(uuidFor(2));
    bed.organizations.add(other);
    const foreign = (await ensureDefaultRoles(bed.roles, bed.ids, other))
      .secretary;

    expect(
      await rejectionOf(() =>
        update.execute(bed.adminContext, {
          roleId: secretary.id,
          name: 'Outro',
        }),
      ),
    ).toBeInstanceOf(SystemRoleImmutableError);
    expect(
      await rejectionOf(() =>
        update.execute(bed.adminContext, { roleId: foreign.id, name: 'X' }),
      ),
    ).toBeInstanceOf(RoleNotFoundError);
    expect(bed.audit.entries).toEqual([]);
  });

  it('não aceita permissão reservada nem fora do catálogo na edição', async () => {
    const { bed, update, missions } = await setup();
    const { id } = await missions();

    for (const permissions of [['access:manage-users'], ['finance:read']]) {
      expect(
        await rejectionOf(() =>
          update.execute(bed.adminContext, { roleId: id, permissions }),
        ),
      ).toBeInstanceOf(ValidationError);
    }
  });
});

describe('DeleteRoleUseCase (UC-02)', () => {
  it('exclui o papel sem atribuições e audita', async () => {
    const { bed, remove, missions } = await setup();
    const { id } = await missions();
    bed.audit.entries.length = 0;

    await remove.execute(bed.adminContext, id);

    expect(await bed.roles.findByIds([RoleId.of(id)])).toEqual([]);
    expect(bed.audit.entries).toMatchObject([
      { action: 'role.deleted', entityId: id },
    ]);
  });

  it('RECUSA excluir papel ainda atribuído (mesmo a usuário desativado), sem auditar', async () => {
    const { bed, remove, missions } = await setup();
    const { id } = await missions();
    await bed.addUser('maria@igreja.com', {
      roleId: RoleId.of(id),
      congregationId: CONGREGATION,
      status: 'DISABLED',
    });
    bed.audit.entries.length = 0;

    expect(
      await rejectionOf(() => remove.execute(bed.adminContext, id)),
    ).toBeInstanceOf(RoleInUseError);
    expect(await bed.roles.findByIds([RoleId.of(id)])).toHaveLength(1);
    expect(bed.audit.entries).toEqual([]);
  });

  it('papel padrão não se exclui; inexistente dá 404', async () => {
    const { bed, remove } = await setup();
    const leader = await bed.roleNamed('Dirigente');

    expect(
      await rejectionOf(() => remove.execute(bed.adminContext, leader.id)),
    ).toBeInstanceOf(SystemRoleImmutableError);
    expect(
      await rejectionOf(() => remove.execute(bed.adminContext, uuidFor(999))),
    ).toBeInstanceOf(RoleNotFoundError);
  });
});
