import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ActorId, OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { Email } from '../domain/email.js';
import { SessionInvalidError, UserNotFoundError } from '../domain/errors.js';
import { UserId } from '../domain/ids.js';
import { Permission } from '../domain/permission.js';
import { A_PASSWORD_HASH, congId } from '../domain/testing/fixtures.js';
import { PasswordHash } from '../domain/password-hash.js';
import { User } from '../domain/user.js';
import { ADMIN_EMAIL, ORGANIZATION, anAuthBed } from './testing/test-bed.js';

async function addUser(
  bed: Awaited<ReturnType<typeof anAuthBed>>,
  input: {
    n: number;
    status?: 'ACTIVE' | 'DISABLED';
    organization?: OrganizationId;
  },
): Promise<User> {
  const user = User.restore({
    id: UserId.of(uuidFor(input.n)),
    organizationId: input.organization ?? ORGANIZATION,
    email: Email.create(`usuario${input.n}@igreja.com`),
    passwordHash: PasswordHash.of(A_PASSWORD_HASH),
    status: input.status ?? 'ACTIVE',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    assignments: [],
    version: 0,
  });
  await bed.users.add(user);
  return user;
}

describe('GetCurrentUserUseCase', () => {
  it('devolve o perfil com os papéis, sem dados de segurança', async () => {
    const bed = await anAuthBed();

    const me = await bed.currentUser.execute(bed.adminContext);

    expect(me).toEqual({
      id: bed.admin.userId,
      organizationId: ORGANIZATION,
      email: ADMIN_EMAIL,
      roles: [
        {
          roleId: bed.admin.roleId,
          roleName: 'Administrador',
          isSystem: true,
          permissions: ['*'],
          congregationId: null,
        },
      ],
    });
    expect(JSON.stringify(me)).not.toContain('argon2');
  });

  it('usuário inexistente', async () => {
    const bed = await anAuthBed();
    const ghost: RequestContext = {
      organizationId: ORGANIZATION,
      actorId: ActorId.of(uuidFor(424242)),
    };

    await expect(bed.currentUser.execute(ghost)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('um contexto de outra igreja não alcança o usuário (isolamento entre igrejas)', async () => {
    const bed = await anAuthBed();
    const otherChurch: RequestContext = {
      organizationId: OrganizationId.of(uuidFor(2)),
      actorId: ActorId.of(bed.admin.userId),
    };

    await expect(bed.currentUser.execute(otherChurch)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('usuário desativado deixa de ser reconhecido (sessão inválida)', async () => {
    const bed = await anAuthBed();
    const disabled = await addUser(bed, { n: 700, status: 'DISABLED' });

    await expect(
      bed.currentUser.execute(bed.contextOf(disabled.id)),
    ).rejects.toBeInstanceOf(SessionInvalidError);
  });
});

describe('GetAccessPolicyUseCase', () => {
  it('o Administrador pode tudo, em qualquer escopo', async () => {
    const bed = await anAuthBed();

    const policy = await bed.accessPolicy.execute(bed.adminContext);

    expect(policy.hasPermission(Permission.of('finance:approve'))).toBe(true);
    expect(policy.can(Permission.of('members:read'), congId(1))).toBe(true);
    expect(policy.scopeFor(Permission.of('qualquer:coisa'))).toEqual({
      kind: 'ORGANIZATION',
    });
  });

  it('um usuário sem papéis não pode nada', async () => {
    const bed = await anAuthBed();
    const plain = await addUser(bed, { n: 701 });

    const policy = await bed.accessPolicy.execute(bed.contextOf(plain.id));

    expect(policy.hasPermission(Permission.of('members:read'))).toBe(false);
    expect(policy.scopeFor(Permission.of('members:read'))).toEqual({
      kind: 'NONE',
    });
  });

  it('um contexto de outra igreja não obtém política (isolamento)', async () => {
    const bed = await anAuthBed();
    const otherChurch: RequestContext = {
      organizationId: OrganizationId.of(uuidFor(2)),
      actorId: ActorId.of(bed.admin.userId),
    };

    await expect(bed.accessPolicy.execute(otherChurch)).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('usuário desativado perde o acesso na hora, mesmo com token de acesso ainda válido', async () => {
    const bed = await anAuthBed();
    const disabled = await addUser(bed, { n: 702, status: 'DISABLED' });

    await expect(
      bed.accessPolicy.execute(bed.contextOf(disabled.id)),
    ).rejects.toBeInstanceOf(SessionInvalidError);
  });
});
