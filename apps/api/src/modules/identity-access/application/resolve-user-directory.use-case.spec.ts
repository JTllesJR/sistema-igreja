import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import { ActorId, OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { PermissionDeniedError } from '../domain/errors.js';
import { PasswordHash } from '../domain/password-hash.js';
import { InMemoryUserRepository } from '../domain/testing/in-memory-user.repository.js';
import {
  A_PASSWORD_HASH,
  anEmail,
  aUser,
  orgId,
  userId,
} from '../domain/testing/fixtures.js';
import { User } from '../domain/user.js';
import {
  MAX_DIRECTORY_IDS,
  ResolveUserDirectoryUseCase,
  type UserDirectoryAccess,
} from './resolve-user-directory.use-case.js';

const allowed: UserDirectoryAccess = { canResolve: () => true };
const denied: UserDirectoryAccess = { canResolve: () => false };
const context = {
  organizationId: orgId(1),
  actorId: ActorId.of(uuidFor(900)),
};

async function aBed() {
  const users = new InMemoryUserRepository();
  await users.add(aUser(1));
  await users.add(aUser(2));
  const disabled = aUser(3);
  disabled.disable();
  await users.add(disabled);
  await users.add(
    User.register({
      id: userId(9),
      organizationId: OrganizationId.of(uuidFor(2)),
      email: anEmail('outra-igreja@igreja.com'),
      passwordHash: PasswordHash.of(A_PASSWORD_HASH),
    }),
  );
  return { users, useCase: new ResolveUserDirectoryUseCase(users) };
}

describe('ResolveUserDirectoryUseCase (ADR 0020)', () => {
  it('troca os ids pedidos por e-mail e situação, em ordem de e-mail, e nada mais', async () => {
    const { useCase } = await aBed();

    const found = await useCase.execute(context, allowed, {
      ids: [userId(2), userId(1), userId(3)],
    });

    expect(found.map((u) => u.id)).toEqual(
      [userId(1), userId(2), userId(3)].sort((a, b) => {
        const email = (id: string) =>
          [aUser(1), aUser(2), aUser(3)].find((u) => u.id === id)!.email.value;
        return email(a).localeCompare(email(b));
      }),
    );
    expect(Object.keys(found[0] ?? {}).sort()).toEqual([
      'active',
      'email',
      'id',
    ]);
    expect(found.find((u) => u.id === userId(3))?.active).toBe(false);
    expect(found.find((u) => u.id === userId(1))?.active).toBe(true);
  });

  it('id de OUTRA igreja ou desconhecido some da resposta, sem erro (igual a inexistente)', async () => {
    const { useCase } = await aBed();

    const found = await useCase.execute(context, allowed, {
      ids: [userId(1), userId(9), userId(404)],
    });

    expect(found.map((u) => u.id)).toEqual([userId(1)]);
    expect(JSON.stringify(found)).not.toContain('outra-igreja');
  });

  it('quem não tem nenhuma das permissões que mostram ids não resolve nada', async () => {
    const { useCase } = await aBed();

    expect(
      await rejectionOf(() =>
        useCase.execute(context, denied, { ids: [userId(1)] }),
      ),
    ).toBeInstanceOf(PermissionDeniedError);
  });

  it('ids repetidos contam uma vez; lista vazia, acima do limite ou fora do formato é recusada', async () => {
    const { useCase } = await aBed();

    expect(
      await useCase.execute(context, allowed, { ids: [userId(1), userId(1)] }),
    ).toHaveLength(1);
    const tooMany = Array.from({ length: MAX_DIRECTORY_IDS + 1 }, (_, n) =>
      uuidFor(5000 + n),
    );
    for (const ids of [[], tooMany, ['não-é-uuid']]) {
      expect(
        await rejectionOf(() => useCase.execute(context, allowed, { ids })),
      ).toBeInstanceOf(ValidationError);
    }
    // O limite exato é aceito.
    const exact = tooMany.slice(0, MAX_DIRECTORY_IDS);
    await expect(
      useCase.execute(context, allowed, { ids: exact }),
    ).resolves.toEqual([]);
  });
});
