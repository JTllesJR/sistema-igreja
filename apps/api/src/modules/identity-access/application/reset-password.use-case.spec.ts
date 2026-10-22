import { describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  InvalidCredentialsError,
  UserNotFoundError,
} from '../domain/errors.js';
import { LOGIN_LOCK } from '../domain/user.js';
import { ResetPasswordUseCase } from './reset-password.use-case.js';
import { ORGANIZATION, USER_PASSWORD, anAuthBed } from './testing/test-bed.js';

async function setup() {
  const bed = await anAuthBed();
  const useCase = new ResetPasswordUseCase(
    bed.users,
    bed.roles,
    bed.hasher,
    bed.generator,
    bed.sessions,
    bed.clock,
    bed.audit,
  );
  const reset = (userId: string) =>
    useCase.execute(bed.adminContext, { userId });
  return { bed, reset };
}

describe('ResetPasswordUseCase (POST /users/:id/reset-password)', () => {
  it('gera uma senha temporária nova: a antiga deixa de valer e a troca fica obrigatória', async () => {
    const { bed, reset } = await setup();
    const user = await bed.addUser('maria@igreja.com');

    const result = await reset(user.id);

    await expect(
      bed.login(USER_PASSWORD, 'maria@igreja.com'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    const login = await bed.login(result.temporaryPassword, 'maria@igreja.com');
    expect(login.user.mustChangePassword).toBe(true);
    expect(result.user.email).toBe('maria@igreja.com');
  });

  it('derruba TODAS as sessões abertas do usuário, sem tocar nas dos outros', async () => {
    const { bed, reset } = await setup();
    const user = await bed.addUser('maria@igreja.com');
    const marias = await bed.login(USER_PASSWORD, 'maria@igreja.com');
    const admins = await bed.login();

    await reset(user.id);

    await expect(
      bed.refresh.execute({ refreshToken: marias.refreshToken }),
    ).rejects.toThrow();
    await expect(
      bed.refresh.execute({ refreshToken: admins.refreshToken }),
    ).resolves.toBeDefined();
  });

  it('destrava uma conta bloqueada por tentativas erradas', async () => {
    const { bed, reset } = await setup();
    const user = await bed.addUser('maria@igreja.com');
    for (let i = 0; i < LOGIN_LOCK.maxAttempts; i++) {
      await bed.login('senha-errada-123', 'maria@igreja.com').catch(() => 0);
    }
    expect(
      (await bed.users.findById(user.id))?.isLockedAt(bed.clock.now()),
    ).toBe(true);

    const result = await reset(user.id);

    await expect(
      bed.login(result.temporaryPassword, 'maria@igreja.com'),
    ).resolves.toBeDefined();
  });

  it('não reativa quem está desativado', async () => {
    const { bed, reset } = await setup();
    const user = await bed.addUser('maria@igreja.com', { status: 'DISABLED' });

    const result = await reset(user.id);

    expect(result.user.status).toBe('DISABLED');
    expect((await bed.users.findById(user.id))?.mustChangePassword).toBe(true);
  });

  it('cada reset gera uma senha diferente e só o hash fica guardado', async () => {
    const { bed, reset } = await setup();
    const user = await bed.addUser('maria@igreja.com');

    const first = await reset(user.id);
    const second = await reset(user.id);

    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
    const stored = await bed.users.findById(user.id);
    expect(stored?.passwordHash.value).not.toContain(second.temporaryPassword);
  });

  it('audita sem a senha e sem o e-mail', async () => {
    const { bed, reset } = await setup();
    const user = await bed.addUser('maria@igreja.com');

    const { temporaryPassword } = await reset(user.id);

    expect(bed.audit.entries).toEqual([
      {
        organizationId: ORGANIZATION,
        actorId: bed.adminContext.actorId,
        action: 'user.password_reset',
        entity: 'user',
        entityId: user.id,
      },
    ]);
    const trail = JSON.stringify(bed.audit.entries);
    expect(trail).not.toContain(temporaryPassword);
    expect(trail).not.toContain('maria@');
  });

  it('usuário de outra igreja ou inexistente: UserNotFound, sem efeito', async () => {
    const { bed, reset } = await setup();
    const foreign = await bed.addUser('de-fora@outra.com', {
      organizationId: OrganizationId.of(uuidFor(2)),
    });
    const before = (await bed.users.findById(foreign.id))?.passwordHash.value;

    await expect(reset(foreign.id)).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(reset(uuidFor(7777))).rejects.toBeInstanceOf(
      UserNotFoundError,
    );

    expect((await bed.users.findById(foreign.id))?.passwordHash.value).toBe(
      before,
    );
    expect(bed.audit.entries).toEqual([]);
  });
});
