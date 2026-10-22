import { describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { Permission } from '../domain/permission.js';
import { RoleName } from '../domain/role-name.js';
import { Role } from '../domain/role.js';
import { RoleId } from '../domain/ids.js';
import { ListRolesUseCase } from './list-roles.use-case.js';
import { ORGANIZATION, anAuthBed } from './testing/test-bed.js';

async function setup() {
  const bed = await anAuthBed();
  return { bed, useCase: new ListRolesUseCase(bed.roles, bed.ids) };
}

describe('ListRolesUseCase (GET /roles)', () => {
  it('lista os papéis da igreja em ordem alfabética, com as permissões de cada um', async () => {
    const { bed, useCase } = await setup();

    const roles = await useCase.execute(bed.adminContext);

    expect(roles.map((r) => r.name)).toEqual([
      'Administrador',
      'Diretoria',
      'Dirigente',
      'Secretário',
      'Tesoureiro',
    ]);
    expect(roles.find((r) => r.name === 'Administrador')).toMatchObject({
      isSystem: true,
      permissions: ['*'],
    });
    expect(roles.find((r) => r.name === 'Secretário')?.permissions).toEqual([
      'members:read',
      'members:write',
      'organization:read',
    ]);
  });

  it('as permissões de cada papel saem em ordem estável', async () => {
    const { bed, useCase } = await setup();

    const leader = (await useCase.execute(bed.adminContext)).find(
      (r) => r.name === 'Dirigente',
    );

    expect(leader?.permissions).toEqual([
      'finance:approve',
      'finance:read',
      'finance:read-individual',
      'members:anonymize',
      'members:read',
      'members:write',
      'organization:read',
    ]);
  });

  it('inclui papéis personalizados, na ordem alfabética do português', async () => {
    const { bed, useCase } = await setup();
    await bed.roles.add(
      Role.restore({
        id: RoleId.of(uuidFor(880)),
        organizationId: ORGANIZATION,
        name: RoleName.create('Ótimo papel'),
        isSystem: false,
        permissions: [Permission.of('members:read')],
      }),
    );

    const names = (await useCase.execute(bed.adminContext)).map((r) => r.name);

    expect(names).toEqual([
      'Administrador',
      'Diretoria',
      'Dirigente',
      'Ótimo papel',
      'Secretário',
      'Tesoureiro',
    ]);
  });

  it('cria os papéis padrão que faltam (igreja antiga) na primeira consulta', async () => {
    const { bed, useCase } = await setup();
    const other = OrganizationId.of(uuidFor(2));
    expect(await bed.roles.listByOrganization(other)).toHaveLength(0);

    const roles = await useCase.execute({
      ...bed.adminContext,
      organizationId: other,
    });

    expect(roles).toHaveLength(5);
    expect(await bed.roles.listByOrganization(other)).toHaveLength(5);
  });

  it('não mostra papéis de outra igreja', async () => {
    const { bed, useCase } = await setup();
    const other = OrganizationId.of(uuidFor(2));
    await useCase.execute({ ...bed.adminContext, organizationId: other });

    const mine = await useCase.execute(bed.adminContext);

    expect(mine).toHaveLength(5);
    const otherIds = (await bed.roles.listByOrganization(other)).map(
      (r) => r.id,
    );
    expect(mine.some((r) => otherIds.includes(RoleId.of(r.id)))).toBe(false);
  });
});
