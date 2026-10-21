import { createHash } from 'node:crypto';
import { jwtVerify } from 'jose';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuthenticateUseCase } from '../src/modules/identity-access/application/authenticate.use-case.js';
import { ChangeOwnPasswordUseCase } from '../src/modules/identity-access/application/change-own-password.use-case.js';
import { CreateAdministratorUseCase } from '../src/modules/identity-access/application/create-administrator.use-case.js';
import { GetAccessPolicyUseCase } from '../src/modules/identity-access/application/get-access-policy.use-case.js';
import { LogoutUseCase } from '../src/modules/identity-access/application/logout.use-case.js';
import { RefreshSessionUseCase } from '../src/modules/identity-access/application/refresh-session.use-case.js';
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  SessionInvalidError,
  SessionReuseDetectedError,
  UnknownOrganizationError,
} from '../src/modules/identity-access/domain/errors.js';
import { Permission } from '../src/modules/identity-access/domain/permission.js';
import { CreateOrganizationUseCase } from '../src/modules/organization/application/create-organization.use-case.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { ActorId, OrganizationId } from '../src/shared/domain/identifiers.js';
import { uuidFor } from '../src/shared/testing/uuid-for.js';
import { cleanDatabase } from './support/clean-database.js';

const PASSWORD = 'senha-super-segura-1';
const EMAIL = 'admin@igreja.com';

let moduleRef: TestingModule;
const use = <T>(token: new (...args: never[]) => T): T =>
  moduleRef.get(token, { strict: false });
const prisma = () => moduleRef.get(PrismaService);

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  await moduleRef.init();
});

beforeEach(async () => {
  await cleanDatabase(prisma());
});

afterAll(async () => {
  await cleanDatabase(prisma());
  await moduleRef.close();
});

/** Cria uma igreja de verdade (módulo organization) e um administrador dela (módulo identity-access). */
async function churchWithAdmin(email = EMAIL) {
  const church = await use(CreateOrganizationUseCase).execute({
    name: 'Igreja Central',
    headquarters: { name: 'Sede' },
  });
  const admin = await use(CreateAdministratorUseCase).execute({
    organizationId: church.organizationId,
    email,
    password: PASSWORD,
  });
  return { church, admin };
}

const login = (password = PASSWORD, email = EMAIL) =>
  use(AuthenticateUseCase).execute({ email, password });

describe('IdentityAccessModule (injeção de dependência + argon2 + JWT + PostgreSQL, sem HTTP)', () => {
  it('cria o administrador, entra e recebe um JWT assinado com o segredo do ambiente', async () => {
    const { church, admin } = await churchWithAdmin();

    const result = await login();

    const secret = new TextEncoder().encode(process.env['JWT_SECRET']);
    const { payload } = await jwtVerify(result.accessToken, secret, {
      algorithms: ['HS256'],
    });
    expect(payload.sub).toBe(admin.userId);
    expect(payload['org']).toBe(church.organizationId);
    expect(typeof payload['sid']).toBe('string');
    expect(result.user.roles.map((r) => r.roleName)).toEqual(['Administrador']);
  });

  it('no banco: só o hash argon2id da senha e só o SHA-256 do token de renovação', async () => {
    await churchWithAdmin();

    const result = await login();

    const user = await prisma().userAccount.findFirst();
    expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user?.passwordHash).not.toContain(PASSWORD);
    const session = await prisma().session.findFirst();
    expect(session?.tokenHash).toBe(
      createHash('sha256').update(result.refreshToken).digest('hex'),
    );
    expect(session?.tokenHash).not.toBe(result.refreshToken);
  });

  it('o administrador pode tudo (política de acesso lida do banco)', async () => {
    const { church, admin } = await churchWithAdmin();

    const policy = await use(GetAccessPolicyUseCase).execute({
      organizationId: church.organizationId,
      actorId: ActorId.of(admin.userId),
    });

    expect(policy.hasPermission(Permission.of('finance:approve'))).toBe(true);
    expect(policy.scopeFor(Permission.of('qualquer:coisa'))).toEqual({
      kind: 'ORGANIZATION',
    });
  });

  it('senha errada e e-mail inexistente dão o mesmo erro genérico', async () => {
    await churchWithAdmin();

    await expect(login('senha-errada-123')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(login(PASSWORD, 'ninguem@igreja.com')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('5 falhas seguidas bloqueiam a conta: nem a senha certa entra', async () => {
    await churchWithAdmin();
    for (let i = 0; i < 5; i++)
      await login('senha-errada-123').catch(() => undefined);

    await expect(login()).rejects.toBeInstanceOf(InvalidCredentialsError);

    const user = await prisma().userAccount.findFirst();
    expect(user?.failedLoginAttempts).toBe(5);
    expect(user?.lockedUntil).not.toBeNull();
  });

  describe('sessões no PostgreSQL', () => {
    it('renova, e reapresentar o token antigo é detectado como roubo e revoga a família', async () => {
      await churchWithAdmin();
      const first = await login();
      const second = await use(RefreshSessionUseCase).execute({
        refreshToken: first.refreshToken,
      });

      await expect(
        use(RefreshSessionUseCase).execute({
          refreshToken: first.refreshToken,
        }),
      ).rejects.toBeInstanceOf(SessionReuseDetectedError);
      await expect(
        use(RefreshSessionUseCase).execute({
          refreshToken: second.refreshToken,
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('duas renovações SIMULTÂNEAS com o mesmo token: só uma vence (corrida resolvida pelo banco)', async () => {
      await churchWithAdmin();
      const first = await login();

      const results = await Promise.allSettled([
        use(RefreshSessionUseCase).execute({
          refreshToken: first.refreshToken,
        }),
        use(RefreshSessionUseCase).execute({
          refreshToken: first.refreshToken,
        }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        results.find((r) => r.status === 'rejected')?.reason,
      ).toBeInstanceOf(SessionReuseDetectedError);
      // Nenhum token novo sobrevive: a corrida foi tratada como roubo e a família foi revogada.
      const winner = results.find(
        (r) => r.status === 'fulfilled',
      ) as PromiseFulfilledResult<{
        refreshToken: string;
      }>;
      await expect(
        use(RefreshSessionUseCase).execute({
          refreshToken: winner.value.refreshToken,
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('logout revoga o dispositivo e não afeta os outros', async () => {
      await churchWithAdmin();
      const phone = await login();
      const notebook = await login();

      await use(LogoutUseCase).execute({ refreshToken: phone.refreshToken });

      await expect(
        use(RefreshSessionUseCase).execute({
          refreshToken: phone.refreshToken,
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
      await expect(
        use(RefreshSessionUseCase).execute({
          refreshToken: notebook.refreshToken,
        }),
      ).resolves.toBeDefined();
    });
  });

  it('trocar a própria senha: a nova funciona, a antiga não, e as outras sessões caem', async () => {
    const { church, admin } = await churchWithAdmin();
    const other = await login();

    await use(ChangeOwnPasswordUseCase).execute(
      {
        organizationId: church.organizationId,
        actorId: ActorId.of(admin.userId),
      },
      { currentPassword: PASSWORD, newPassword: 'uma-senha-nova-e-forte-9' },
    );

    await expect(login('uma-senha-nova-e-forte-9')).resolves.toBeDefined();
    await expect(login(PASSWORD)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    await expect(
      use(RefreshSessionUseCase).execute({ refreshToken: other.refreshToken }),
    ).rejects.toBeInstanceOf(SessionInvalidError);
  });

  describe('integração com o módulo organization', () => {
    it('recusa criar administrador para uma igreja que não existe (consulta pública do organization)', async () => {
      await expect(
        use(CreateAdministratorUseCase).execute({
          organizationId: OrganizationId.of(uuidFor(777)),
          email: 'novo@igreja.com',
          password: PASSWORD,
        }),
      ).rejects.toBeInstanceOf(UnknownOrganizationError);
    });

    it('o e-mail é único no sistema inteiro: outra igreja não pode reutilizá-lo', async () => {
      await churchWithAdmin();
      const other = await use(CreateOrganizationUseCase).execute({
        name: 'Outra Igreja',
        headquarters: { name: 'Matriz' },
      });

      await expect(
        use(CreateAdministratorUseCase).execute({
          organizationId: other.organizationId,
          email: EMAIL,
          password: PASSWORD,
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });
  });
});
