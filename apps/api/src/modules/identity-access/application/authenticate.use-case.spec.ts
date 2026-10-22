import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { Email } from '../domain/email.js';
import { InvalidCredentialsError } from '../domain/errors.js';
import { UserId } from '../domain/ids.js';
import { PlainPassword } from '../domain/plain-password.js';
import { DAY, MINUTE, NOW, after } from '../domain/testing/fixtures.js';
import { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import { AuthenticateUseCase } from './authenticate.use-case.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ORGANIZATION,
  anAuthBed,
} from './testing/test-bed.js';

describe('AuthenticateUseCase (UC-01, entrar)', () => {
  describe('sucesso', () => {
    it('devolve os tokens e o perfil do usuário com seus papéis', async () => {
      const bed = await anAuthBed();

      const result = await bed.login();

      expect(result.accessToken).toBe(
        `access:${bed.admin.userId}:${bed.signer.signed[0]?.sessionId}`,
      );
      expect(result.refreshToken).toBe('refresh-token-1');
      expect(result.user).toEqual({
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
    });

    it('cria uma sessão cujo hash do token está guardado (o token em si, não)', async () => {
      const bed = await anAuthBed();

      const result = await bed.login();

      const session = await bed.sessions.findByTokenHash(
        bed.codec.hashOf(result.refreshToken),
      );
      expect(session?.userId).toBe(bed.admin.userId);
      expect(session?.state(NOW)).toBe('ACTIVE');
      expect(JSON.stringify(session)).not.toContain(result.refreshToken);
    });

    it('o token de renovação vale 30 dias e o de acesso, 15 minutos', async () => {
      const bed = await anAuthBed();

      const result = await bed.login();

      expect(result.refreshTokenExpiresAt).toEqual(after(NOW, 30 * DAY));
      expect(result.accessTokenExpiresAt).toEqual(after(NOW, 15 * MINUTE));
    });

    it('registra o último login e zera as falhas anteriores', async () => {
      const bed = await anAuthBed();
      await expect(bed.login('senha-errada-qualquer')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );

      await bed.login();

      const user = await bed.users.findById(bed.admin.userId);
      expect(user?.failedLoginAttempts).toBe(0);
      expect(user?.lastLoginAt).toEqual(NOW);
    });

    it('aceita o e-mail com outra caixa e espaços nas pontas', async () => {
      const bed = await anAuthBed();

      await expect(
        bed.login(ADMIN_PASSWORD, '  ADMIN@Igreja.COM '),
      ).resolves.toBeDefined();
    });

    it('cada login abre uma família de sessões própria (vários dispositivos)', async () => {
      const bed = await anAuthBed();

      const a = await bed.login();
      const b = await bed.login();

      const sessionA = await bed.sessions.findByTokenHash(
        bed.codec.hashOf(a.refreshToken),
      );
      const sessionB = await bed.sessions.findByTokenHash(
        bed.codec.hashOf(b.refreshToken),
      );
      expect(sessionA?.familyId).not.toBe(sessionB?.familyId);
    });

    it('re-hasha a senha quando os parâmetros do hash ficaram para trás', async () => {
      const bed = await anAuthBed();
      const before = (await bed.users.findById(bed.admin.userId))?.passwordHash
        .value;
      bed.hasher.rehashNeeded = true;

      await bed.login();

      const rehashed = (await bed.users.findById(bed.admin.userId))
        ?.passwordHash.value;
      expect(rehashed).not.toBe(before);
      // A senha continua funcionando com o hash novo.
      bed.hasher.rehashNeeded = false;
      await expect(bed.login()).resolves.toBeDefined();
    });

    it('não re-hasha quando os parâmetros do hash estão em dia', async () => {
      const bed = await anAuthBed();
      const hashCalls = bed.hasher.hashCalls;

      await bed.login();

      expect(bed.hasher.hashCalls).toBe(hashCalls);
    });

    it('não falha quando outra aba grava o mesmo usuário ao mesmo tempo (tenta de novo)', async () => {
      const bed = await anAuthBed();
      let conflicts = 0;
      const flaky: UserRepository = {
        findById: (id) => bed.users.findById(id),
        findByEmail: (email) => bed.users.findByEmail(email),
        listByOrganization: (id) => bed.users.listByOrganization(id),
        saveGuardingLastAdministrator: (user, roleId) =>
          bed.users.saveGuardingLastAdministrator(user, roleId),
        add: (user) => bed.users.add(user),
        save: async (user) => {
          if (conflicts < 1) {
            conflicts += 1;
            throw new ConcurrencyConflictError();
          }
          await bed.users.save(user);
        },
      };
      const authenticate = new AuthenticateUseCase(
        flaky,
        bed.roles,
        bed.sessions,
        bed.hasher,
        bed.signer,
        bed.codec,
        bed.ids,
        bed.clock,
        bed.policy,
      );

      await expect(
        authenticate.execute({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      ).resolves.toBeDefined();

      expect(conflicts).toBe(1);
      expect((await bed.users.findById(bed.admin.userId))?.lastLoginAt).toEqual(
        NOW,
      );
    });
  });

  describe('falhas (sempre o mesmo erro genérico)', () => {
    it('senha errada: erro de credenciais e registra a falha', async () => {
      const bed = await anAuthBed();

      await expect(bed.login('senha-errada-qualquer')).rejects.toBeInstanceOf(
        InvalidCredentialsError,
      );

      expect(
        (await bed.users.findById(bed.admin.userId))?.failedLoginAttempts,
      ).toBe(1);
    });

    it('e-mail inexistente: mesmo erro, e ainda gasta o tempo de uma verificação', async () => {
      const bed = await anAuthBed();

      await expect(
        bed.login(ADMIN_PASSWORD, 'ninguem@igreja.com'),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect(bed.hasher.simulatedCalls).toBe(1);
      expect(bed.hasher.verifyCalls).toBe(0);
    });

    it('senha errada e e-mail inexistente produzem exatamente o mesmo erro (não revelam o que falhou)', async () => {
      const bed = await anAuthBed();

      const wrongPassword = await bed
        .login('senha-errada-qualquer')
        .catch((e: unknown) => e);
      const unknownEmail = await bed
        .login(ADMIN_PASSWORD, 'ninguem@igreja.com')
        .catch((e: unknown) => e);

      expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
      expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
      expect((wrongPassword as Error).message).toBe(
        (unknownEmail as Error).message,
      );
      expect((wrongPassword as InvalidCredentialsError).code).toBe(
        (unknownEmail as InvalidCredentialsError).code,
      );
    });

    it.each([
      ['e-mail malformado', 'isto-nao-e-email', ADMIN_PASSWORD],
      ['senha vazia', ADMIN_EMAIL, ''],
      ['senha curta demais', ADMIN_EMAIL, 'curta'],
    ])(
      '%s: também é erro de credenciais (não de validação)',
      async (_nome, email, password) => {
        const bed = await anAuthBed();

        await expect(bed.login(password, email)).rejects.toBeInstanceOf(
          InvalidCredentialsError,
        );
      },
    );

    it('não cria sessão quando o login falha', async () => {
      const bed = await anAuthBed();

      await bed.login('senha-errada-qualquer').catch(() => undefined);

      expect(
        await bed.sessions.findByTokenHash(bed.codec.hashOf('refresh-token-1')),
      ).toBeNull();
    });

    it('usuário desativado não entra, mesmo com a senha certa', async () => {
      const bed = await anAuthBed();
      const email = Email.create('inativo@igreja.com');
      await bed.users.add(
        User.restore({
          id: UserId.of(uuidFor(555)),
          organizationId: ORGANIZATION,
          email,
          passwordHash: await bed.hasher.hash(
            PlainPassword.create('senha-do-inativo-123', email),
          ),
          status: 'DISABLED',
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          assignments: [],
          version: 0,
        }),
      );

      await expect(
        bed.login('senha-do-inativo-123', 'inativo@igreja.com'),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });
  });

  describe('bloqueio por tentativas', () => {
    it('depois de 5 falhas a conta bloqueia, e nem a senha certa entra', async () => {
      const bed = await anAuthBed();
      for (let i = 0; i < 5; i++) {
        await bed.login('senha-errada-qualquer').catch(() => undefined);
      }

      await expect(bed.login()).rejects.toBeInstanceOf(InvalidCredentialsError);

      expect((await bed.users.findById(bed.admin.userId))?.lockedUntil).toEqual(
        after(NOW, 15 * MINUTE),
      );
    });

    it('durante o bloqueio não verifica a senha nem cria sessão', async () => {
      const bed = await anAuthBed();
      for (let i = 0; i < 5; i++)
        await bed.login('senha-errada-qualquer').catch(() => undefined);
      const verifications = bed.hasher.verifyCalls;

      await bed.login().catch(() => undefined);

      expect(bed.hasher.verifyCalls).toBe(verifications);
    });

    it('passados os 15 minutos, a senha certa volta a funcionar', async () => {
      const bed = await anAuthBed();
      for (let i = 0; i < 5; i++)
        await bed.login('senha-errada-qualquer').catch(() => undefined);
      bed.clock.advance(15 * MINUTE);

      await expect(bed.login()).resolves.toBeDefined();
    });
  });
});
