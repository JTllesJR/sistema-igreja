import { describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { ListUsersUseCase } from './list-users.use-case.js';
import {
  ADMIN_EMAIL,
  CONGREGATION,
  ORGANIZATION,
  anAuthBed,
} from './testing/test-bed.js';

async function setup() {
  const bed = await anAuthBed();
  return { bed, useCase: new ListUsersUseCase(bed.users, bed.roles) };
}

describe('ListUsersUseCase (GET /users)', () => {
  it('lista os usuários da igreja em ordem de e-mail, com os papéis e escopos de cada um', async () => {
    const { bed, useCase } = await setup();
    const secretary = await bed.roleNamed('Secretário');
    await bed.addUser('zelia@igreja.com', {
      roleId: secretary.id,
      congregationId: CONGREGATION,
    });
    await bed.addUser('bruno@igreja.com');

    const users = await useCase.execute(bed.adminContext);

    expect(users.map((u) => u.email)).toEqual([
      ADMIN_EMAIL,
      'bruno@igreja.com',
      'zelia@igreja.com',
    ]);
    expect(users[0]?.roles).toEqual([
      {
        roleId: bed.admin.roleId,
        roleName: 'Administrador',
        congregationId: null,
      },
    ]);
    expect(users[1]?.roles).toEqual([]);
    expect(users[2]?.roles).toEqual([
      {
        roleId: secretary.id,
        roleName: 'Secretário',
        congregationId: CONGREGATION,
      },
    ]);
  });

  it('mostra a situação e o último login (ISO) ou null', async () => {
    const { bed, useCase } = await setup();
    await bed.addUser('inativo@igreja.com', { status: 'DISABLED' });
    await bed.login();

    const users = await useCase.execute(bed.adminContext);

    const admin = users.find((u) => u.email === ADMIN_EMAIL);
    const inactive = users.find((u) => u.email === 'inativo@igreja.com');
    expect(admin?.status).toBe('ACTIVE');
    expect(admin?.lastLoginAt).toBe(bed.clock.now().toISOString());
    expect(inactive?.status).toBe('DISABLED');
    expect(inactive?.lastLoginAt).toBeNull();
  });

  it('não mostra usuários de outra igreja', async () => {
    const { bed, useCase } = await setup();
    const other = OrganizationId.of(uuidFor(2));
    await bed.addUser('de-fora@outra.com', { organizationId: other });

    const users = await useCase.execute(bed.adminContext);

    expect(users.map((u) => u.email)).toEqual([ADMIN_EMAIL]);
    const fromOther = await useCase.execute({
      ...bed.adminContext,
      organizationId: other,
    });
    expect(fromOther.map((u) => u.email)).toEqual(['de-fora@outra.com']);
    expect(ORGANIZATION).not.toBe(other);
  });

  it('nunca expõe hash de senha nem dados de bloqueio', async () => {
    const { bed, useCase } = await setup();

    const json = JSON.stringify(await useCase.execute(bed.adminContext));

    expect(json).not.toMatch(/argon2|passwordHash|failedLogin|lockedUntil/i);
  });

  it('um papel apagado do banco não derruba a lista: a atribuição simplesmente não aparece', async () => {
    const { bed } = await setup();
    await bed.addUser('orfao@igreja.com', {
      roleId: (await bed.roleNamed('Dirigente')).id,
    });
    const roles = {
      listByOrganization: () =>
        Promise.resolve(
          [] as Awaited<ReturnType<typeof bed.roles.listByOrganization>>,
        ),
    };
    const withoutRoles = new ListUsersUseCase(bed.users, roles as never);

    const users = await withoutRoles.execute(bed.adminContext);

    expect(users.every((u) => u.roles.length === 0)).toBe(true);
  });
});
