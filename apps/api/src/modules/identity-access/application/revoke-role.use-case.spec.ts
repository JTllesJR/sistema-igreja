import { describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  AssignmentNotFoundError,
  LastAdministratorError,
  UserNotFoundError,
} from '../domain/errors.js';
import { ensureDefaultRoles } from './default-roles.js';
import { RevokeRoleUseCase } from './revoke-role.use-case.js';
import {
  CONGREGATION,
  ORGANIZATION,
  OTHER_CONGREGATION,
  anAuthBed,
} from './testing/test-bed.js';

async function setup() {
  const bed = await anAuthBed();
  const useCase = new RevokeRoleUseCase(bed.users, bed.roles, bed.audit);
  const secretary = await bed.roleNamed('Secretário');
  const revoke = (
    userId: string,
    roleId: string,
    congregationId: string | null = null,
  ) => useCase.execute(bed.adminContext, { userId, roleId, congregationId });
  return { bed, secretary, revoke };
}

describe('RevokeRoleUseCase (POST /users/:id/assignments/revoke)', () => {
  it('remove só a atribuição indicada e devolve o usuário atualizado', async () => {
    const { bed, secretary, revoke } = await setup();
    const user = await bed.addUser('maria@igreja.com', {
      roleId: secretary.id,
      congregationId: CONGREGATION,
    });
    const stored = (await bed.users.findById(user.id))!;
    stored.assignRole(secretary.id, OTHER_CONGREGATION);
    await bed.users.save(stored);

    const view = await revoke(user.id, secretary.id, CONGREGATION);

    expect(view.roles.map((r) => r.congregationId)).toEqual([
      OTHER_CONGREGATION,
    ]);
  });

  it('atribuição que o usuário não tem: AssignmentNotFound, sem auditar', async () => {
    const { bed, secretary, revoke } = await setup();
    const user = await bed.addUser('maria@igreja.com', {
      roleId: secretary.id,
      congregationId: CONGREGATION,
    });

    await expect(
      revoke(user.id, secretary.id, OTHER_CONGREGATION),
    ).rejects.toBeInstanceOf(AssignmentNotFoundError);
    expect(bed.audit.entries).toEqual([]);
  });

  it('usuário de outra igreja ou inexistente: UserNotFound', async () => {
    const { bed, secretary, revoke } = await setup();
    const foreign = await bed.addUser('de-fora@outra.com', {
      organizationId: OrganizationId.of(uuidFor(2)),
      roleId: secretary.id,
    });

    await expect(revoke(foreign.id, secretary.id)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    await expect(revoke(uuidFor(7777), secretary.id)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect((await bed.users.findById(foreign.id))?.assignments).toHaveLength(1);
  });

  it('audita sem dado pessoal', async () => {
    const { bed, secretary, revoke } = await setup();
    const user = await bed.addUser('maria@igreja.com', {
      roleId: secretary.id,
    });

    await revoke(user.id, secretary.id);

    expect(bed.audit.entries).toEqual([
      {
        organizationId: ORGANIZATION,
        actorId: bed.adminContext.actorId,
        action: 'user.role_revoked',
        entity: 'user',
        entityId: user.id,
        metadata: { roleId: secretary.id, congregationId: null },
      },
    ]);
  });

  describe('a igreja nunca fica sem Administrador ativo', () => {
    it('recusa tirar o Administrador do ÚNICO administrador', async () => {
      const { bed, revoke } = await setup();

      await expect(
        revoke(bed.admin.userId, bed.admin.roleId),
      ).rejects.toBeInstanceOf(LastAdministratorError);

      expect(
        (await bed.users.findById(bed.admin.userId))?.assignments,
      ).toHaveLength(1);
      expect(bed.audit.entries).toEqual([]);
    });

    it('permite quando existe outro administrador ativo (inclusive tirar de si mesmo)', async () => {
      const { bed, revoke } = await setup();
      await bed.createAdministrator.execute({
        organizationId: ORGANIZATION,
        email: 'segundo@igreja.com',
        password: 'outra-senha-bem-segura',
      });

      await expect(
        revoke(bed.admin.userId, bed.admin.roleId),
      ).resolves.toBeDefined();
    });

    it('o outro administrador precisa estar ATIVO', async () => {
      const { bed, revoke } = await setup();
      await bed.addUser('inativo@igreja.com', {
        roleId: bed.admin.roleId,
        status: 'DISABLED',
      });

      await expect(
        revoke(bed.admin.userId, bed.admin.roleId),
      ).rejects.toBeInstanceOf(LastAdministratorError);
    });

    it('tirar outro papel de um administrador não aciona a regra', async () => {
      const { bed, secretary, revoke } = await setup();
      const stored = (await bed.users.findById(bed.admin.userId))!;
      stored.assignRole(secretary.id, CONGREGATION);
      await bed.users.save(stored);

      await expect(
        revoke(bed.admin.userId, secretary.id, CONGREGATION),
      ).resolves.toBeDefined();
    });

    it('numa igreja SEM nenhum administrador, revogar um papel comum não é barrado', async () => {
      const { bed } = await setup();
      const orphan = OrganizationId.of(uuidFor(2));
      bed.organizations.add(orphan);
      const { secretary } = await ensureDefaultRoles(
        bed.roles,
        bed.ids,
        orphan,
      );
      const user = await bed.addUser('a@outra.com', {
        organizationId: orphan,
        roleId: secretary.id,
      });
      const context = { ...bed.adminContext, organizationId: orphan };

      await expect(
        new RevokeRoleUseCase(bed.users, bed.roles, bed.audit).execute(
          context,
          { userId: user.id, roleId: secretary.id, congregationId: null },
        ),
      ).resolves.toBeDefined();
    });
  });
});
