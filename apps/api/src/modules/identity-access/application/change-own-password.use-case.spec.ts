import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { ActorId, OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  CurrentPasswordIncorrectError,
  InvalidCredentialsError,
  SessionInvalidError,
  UserNotFoundError,
} from '../domain/errors.js';
import { MINUTE, NOW } from '../domain/testing/fixtures.js';
import {
  ADMIN_PASSWORD,
  USER_PASSWORD,
  anAuthBed,
} from './testing/test-bed.js';

const NEW_PASSWORD = 'uma-senha-nova-e-forte-9';

describe('ChangeOwnPasswordUseCase (UC-18)', () => {
  it('troca a senha: a nova funciona e a antiga deixa de funcionar', async () => {
    const bed = await anAuthBed();

    await bed.changePassword.execute(bed.adminContext, {
      currentPassword: ADMIN_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    await expect(bed.login(NEW_PASSWORD)).resolves.toBeDefined();
    await expect(bed.login(ADMIN_PASSWORD)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('a nova senha tem de ser diferente da atual', async () => {
    const bed = await anAuthBed();

    const error = await bed.changePassword
      .execute(bed.adminContext, {
        currentPassword: ADMIN_PASSWORD,
        newPassword: ADMIN_PASSWORD,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe('newPassword');
    await expect(bed.login(ADMIN_PASSWORD)).resolves.toBeDefined();
  });

  it('encerra a troca obrigatória de quem entrou com senha temporária', async () => {
    const bed = await anAuthBed();
    const user = await bed.addUser('nova@igreja.com', {
      mustChangePassword: true,
    });
    const context = bed.contextOf(user.id);
    expect((await bed.users.findById(user.id))?.mustChangePassword).toBe(true);

    await bed.changePassword.execute(context, {
      currentPassword: USER_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect((await bed.users.findById(user.id))?.mustChangePassword).toBe(false);
  });

  it('senha atual errada: rejeita, não troca e conta como tentativa falha', async () => {
    const bed = await anAuthBed();

    await expect(
      bed.changePassword.execute(bed.adminContext, {
        currentPassword: 'a-senha-atual-errada',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(CurrentPasswordIncorrectError);

    const afterFailure = await bed.users.findById(bed.admin.userId);
    expect(afterFailure?.failedLoginAttempts).toBe(1);
    await expect(bed.login(ADMIN_PASSWORD)).resolves.toBeDefined();
  });

  it('a tentativa com senha atual errada alimenta o bloqueio (não dá para adivinhar a senha com um token roubado)', async () => {
    const bed = await anAuthBed();

    for (let i = 0; i < 5; i++) {
      await bed.changePassword
        .execute(bed.adminContext, {
          currentPassword: 'errada-numero-' + i + 'xxxx',
          newPassword: NEW_PASSWORD,
        })
        .catch(() => undefined);
    }

    const user = await bed.users.findById(bed.admin.userId);
    expect(user?.lockedUntil).toEqual(new Date(NOW.getTime() + 15 * MINUTE));
    // Bloqueada: nem a senha certa é verificada.
    const verifications = bed.hasher.verifyCalls;
    await expect(
      bed.changePassword.execute(bed.adminContext, {
        currentPassword: ADMIN_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(CurrentPasswordIncorrectError);
    expect(bed.hasher.verifyCalls).toBe(verifications);
  });

  it('nova senha fora da política: rejeita e mantém a atual', async () => {
    const bed = await anAuthBed();

    await expect(
      bed.changePassword.execute(bed.adminContext, {
        currentPassword: ADMIN_PASSWORD,
        newPassword: 'curta',
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(bed.login(ADMIN_PASSWORD)).resolves.toBeDefined();
  });

  it('revoga as outras sessões e mantém a do dispositivo atual', async () => {
    const bed = await anAuthBed();
    const current = await bed.login();
    const other = await bed.login();
    const currentSession = await bed.sessions.findByTokenHash(
      bed.codec.hashOf(current.refreshToken),
    );

    await bed.changePassword.execute(bed.adminContext, {
      currentPassword: ADMIN_PASSWORD,
      newPassword: NEW_PASSWORD,
      currentSessionId: currentSession?.id,
    });

    await expect(
      bed.refresh.execute({ refreshToken: other.refreshToken }),
    ).rejects.toBeInstanceOf(SessionInvalidError);
    await expect(
      bed.refresh.execute({ refreshToken: current.refreshToken }),
    ).resolves.toBeDefined();
  });

  it('sem indicar a sessão atual, revoga todas', async () => {
    const bed = await anAuthBed();
    const a = await bed.login();
    const b = await bed.login();

    await bed.changePassword.execute(bed.adminContext, {
      currentPassword: ADMIN_PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    for (const token of [a.refreshToken, b.refreshToken]) {
      await expect(
        bed.refresh.execute({ refreshToken: token }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    }
  });

  it('um contexto de outra igreja não alcança o usuário (isolamento)', async () => {
    const bed = await anAuthBed();
    const otherChurch: RequestContext = {
      organizationId: OrganizationId.of(uuidFor(2)),
      actorId: ActorId.of(bed.admin.userId),
    };

    await expect(
      bed.changePassword.execute(otherChurch, {
        currentPassword: ADMIN_PASSWORD,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
