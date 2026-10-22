import { describe, expect, it } from 'vitest';
import {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  AdministratorScopeError,
  CongregationUnavailableError,
  RoleAlreadyAssignedError,
  RoleNotFoundError,
  UserNotFoundError,
} from '../domain/errors.js';
import { RoleId } from '../domain/ids.js';
import { AssignRoleUseCase } from './assign-role.use-case.js';
import {
  CONGREGATION,
  INACTIVE_CONGREGATION,
  ORGANIZATION,
  OTHER_CONGREGATION,
  anAuthBed,
} from './testing/test-bed.js';

async function setup() {
  const bed = await anAuthBed();
  const useCase = new AssignRoleUseCase(
    bed.users,
    bed.roles,
    bed.organizations,
    bed.audit,
  );
  const secretary = await bed.roleNamed('Secretário');
  const user = await bed.addUser('maria@igreja.com');
  const assign = (
    roleId: string = secretary.id,
    congregationId: string | null = CONGREGATION,
    userId: string = user.id,
  ) => useCase.execute(bed.adminContext, { userId, roleId, congregationId });
  return { bed, useCase, secretary, user, assign };
}

describe('AssignRoleUseCase (POST /users/:id/assignments)', () => {
  it('atribui o papel a uma congregação e devolve o usuário atualizado', async () => {
    const { bed, assign, user, secretary } = await setup();

    const view = await assign();

    expect(view.roles).toEqual([
      {
        roleId: secretary.id,
        roleName: 'Secretário',
        congregationId: CONGREGATION,
      },
    ]);
    const stored = await bed.users.findById(user.id);
    expect(stored?.assignments).toHaveLength(1);
    expect(stored?.assignments[0]?.congregationId).toBe(CONGREGATION);
  });

  it('atribui para a igreja toda quando congregationId é null', async () => {
    const { bed, assign, user } = await setup();

    await assign(undefined, null);

    expect(
      (await bed.users.findById(user.id))?.assignments[0]?.isOrganizationWide,
    ).toBe(true);
  });

  it('o mesmo papel em congregações diferentes é permitido; repetir o mesmo escopo é recusado', async () => {
    const { assign, secretary } = await setup();
    await assign(secretary.id, CONGREGATION);
    await assign(secretary.id, OTHER_CONGREGATION);
    await expect(assign(secretary.id, CONGREGATION)).rejects.toBeInstanceOf(
      RoleAlreadyAssignedError,
    );
  });

  it('o Administrador só pode ser atribuído à igreja toda', async () => {
    const { bed, assign, user } = await setup();

    await expect(assign(bed.admin.roleId, CONGREGATION)).rejects.toBeInstanceOf(
      AdministratorScopeError,
    );
    expect((await bed.users.findById(user.id))?.assignments).toHaveLength(0);

    await expect(assign(bed.admin.roleId, null)).resolves.toBeDefined();
  });

  it('congregação inativa, inexistente ou de outra igreja: recusa', async () => {
    const { bed, assign, user } = await setup();
    const otherChurch = OrganizationId.of(uuidFor(2));
    const foreign = uuidFor(1900);
    bed.organizations.add(otherChurch);
    bed.organizations.addCongregation(otherChurch, CongregationId.of(foreign));

    for (const congregationId of [
      INACTIVE_CONGREGATION,
      uuidFor(1999),
      foreign,
    ]) {
      await expect(assign(undefined, congregationId)).rejects.toBeInstanceOf(
        CongregationUnavailableError,
      );
    }
    expect((await bed.users.findById(user.id))?.assignments).toHaveLength(0);
  });

  it('papel inexistente ou de outra igreja: RoleNotFound, sem revelar qual', async () => {
    const { bed, assign } = await setup();
    const otherChurch = OrganizationId.of(uuidFor(2));
    bed.organizations.add(otherChurch);
    const foreignRole = (
      await bed.createAdministrator.execute({
        organizationId: otherChurch,
        email: 'admin@outra.com',
        password: 'senha-super-segura-9',
      })
    ).roleId;

    await expect(assign(foreignRole)).rejects.toBeInstanceOf(RoleNotFoundError);
    await expect(assign(RoleId.of(uuidFor(8888)))).rejects.toBeInstanceOf(
      RoleNotFoundError,
    );
  });

  it('usuário inexistente ou de outra igreja: UserNotFound', async () => {
    const { bed, assign } = await setup();
    const otherChurch = OrganizationId.of(uuidFor(2));
    const foreign = await bed.addUser('de-fora@outra.com', {
      organizationId: otherChurch,
    });

    await expect(
      assign(undefined, CONGREGATION, foreign.id),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(
      assign(undefined, CONGREGATION, uuidFor(7777)),
    ).rejects.toBeInstanceOf(UserNotFoundError);
    expect((await bed.users.findById(foreign.id))?.assignments).toHaveLength(0);
  });

  it('registra na auditoria quem fez o quê, sem e-mail nem dado pessoal', async () => {
    const { bed, assign, user, secretary } = await setup();

    await assign();

    expect(bed.audit.entries).toEqual([
      {
        organizationId: ORGANIZATION,
        actorId: bed.adminContext.actorId,
        action: 'user.role_assigned',
        entity: 'user',
        entityId: user.id,
        metadata: { roleId: secretary.id, congregationId: CONGREGATION },
      },
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toContain('maria@');
  });

  it('não audita o que foi recusado', async () => {
    const { bed, assign, secretary } = await setup();
    await assign();
    bed.audit.entries.length = 0;

    await expect(assign(secretary.id, CONGREGATION)).rejects.toThrow();

    expect(bed.audit.entries).toEqual([]);
  });

  it('se a trilha falhar, o erro sobe (a alteração já foi gravada, e a falha é visível)', async () => {
    const { bed, assign, user } = await setup();
    bed.audit.failWith = new Error('trilha fora do ar');

    await expect(assign()).rejects.toThrow('trilha fora do ar');
    expect((await bed.users.findById(user.id))?.assignments).toHaveLength(1);
  });
});
