import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type request from 'supertest';
import { AUDIT_LOG } from '../../../../audit/index.js';
import {
  ConfigModule,
  ENV,
} from '../../../../../platform/config/config.module.js';
import { parseEnv } from '../../../../../platform/config/env.js';
import { configureHttpApp } from '../../../../../platform/http/configure-http-app.js';
import { HttpPlatformModule } from '../../../../../platform/http/http-platform.module.js';
import {
  type CongregationId,
  OrganizationId,
} from '../../../../../shared/domain/identifiers.js';
import { FixedClock } from '../../../../../shared/testing/fixed-clock.js';
import { InMemoryAuditLog } from '../../../../../shared/testing/in-memory-audit-log.js';
import { uuidFor } from '../../../../../shared/testing/uuid-for.js';
import type { AccessTokenSigner } from '../../../application/access-token-signer.js';
import { CreateAdministratorUseCase } from '../../../application/create-administrator.use-case.js';
import type { PasswordHasher } from '../../../application/password-hasher.js';
import { FakeOrganizationDirectory } from '../../../application/testing/fakes.js';
import { Email } from '../../../domain/email.js';
import { RoleId, UserId } from '../../../domain/ids.js';
import { Permission } from '../../../domain/permission.js';
import { PlainPassword } from '../../../domain/plain-password.js';
import { RoleName } from '../../../domain/role-name.js';
import { Role } from '../../../domain/role.js';
import { NOW } from '../../../domain/testing/fixtures.js';
import { InMemoryRoleRepository } from '../../../domain/testing/in-memory-role.repository.js';
import { InMemorySessionRepository } from '../../../domain/testing/in-memory-session.repository.js';
import { InMemoryUserRepository } from '../../../domain/testing/in-memory-user.repository.js';
import { User } from '../../../domain/user.js';
import { IdentityAccessModule } from '../../../identity-access.module.js';
import {
  ACCESS_TOKEN_SIGNER,
  CLOCK,
  ORGANIZATION_DIRECTORY,
  PASSWORD_HASHER,
  ROLE_REPOSITORY,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from '../../../identity-access.tokens.js';

/** A igreja (e o administrador) que a aplicação de teste já traz pronta. */
export const TEST_ORGANIZATION = OrganizationId.of(uuidFor(1));
export const TEST_ADMIN_EMAIL = 'admin@igreja.com';
export const TEST_PASSWORD = 'senha-super-segura-1';

export interface HttpTestAppOptions {
  /** Controllers extras (rotas só de teste). */
  controllers?: Type<unknown>[];
  /** Módulos extras a incluir (ex.: o módulo que está sendo testado). */
  imports?: Type<unknown>[];
  /** Troca de provedores (ex.: o repositório de outro módulo por um em memória). Recebe o relógio de teste. */
  overrides?: (
    builder: TestingModuleBuilder,
    context: { clock: FixedClock },
  ) => TestingModuleBuilder;
}

/**
 * A aplicação HTTP REAL (guard global, filtro de erros, limite de taxa, cookies, controllers de todos os módulos),
 * mas com os repositórios em memória e o relógio controlável: roda em milissegundos e sem banco.
 * O que o PostgreSQL acrescenta já é coberto pelos testes de contrato dos repositórios.
 */
export async function startHttpTestApp(options: HttpTestAppOptions = {}) {
  const clock = new FixedClock(NOW);
  const directory = new FakeOrganizationDirectory();
  directory.add(TEST_ORGANIZATION);
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const audit = new InMemoryAuditLog();

  let builder = Test.createTestingModule({
    imports: [
      ConfigModule,
      HttpPlatformModule,
      IdentityAccessModule,
      ...(options.imports ?? []),
    ],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(ENV)
    .useValue(
      parseEnv({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://nao:usado@localhost:5432/nenhum',
        JWT_SECRET: 'segredo-somente-para-testes-http-0123456789-abc',
        CORS_ORIGINS: 'http://localhost:5173',
      }),
    )
    .overrideProvider(USER_REPOSITORY)
    .useValue(users)
    .overrideProvider(ROLE_REPOSITORY)
    .useValue(roles)
    .overrideProvider(SESSION_REPOSITORY)
    .useValue(new InMemorySessionRepository())
    .overrideProvider(ORGANIZATION_DIRECTORY)
    .useValue(directory)
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(AUDIT_LOG)
    .useValue(audit);
  builder = options.overrides ? options.overrides(builder, { clock }) : builder;

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureHttpApp(app, { CORS_ORIGINS: ['http://localhost:5173'] });
  await app.init();

  const hasher = moduleRef.get<PasswordHasher>(PASSWORD_HASHER, {
    strict: false,
  });
  const signer = moduleRef.get<AccessTokenSigner>(ACCESS_TOKEN_SIGNER, {
    strict: false,
  });

  const admin = await moduleRef
    .get(CreateAdministratorUseCase, { strict: false })
    .execute({
      organizationId: TEST_ORGANIZATION,
      email: TEST_ADMIN_EMAIL,
      password: TEST_PASSWORD,
    });

  /** Usuário comum, com um papel de permissões específicas (ou sem papel nenhum). A senha é `TEST_PASSWORD`. */
  async function addUser(
    n: number,
    userOptions: {
      permissions?: string[];
      status?: 'ACTIVE' | 'DISABLED';
      /** Restringe o papel a uma congregação (padrão: a igreja toda). */
      congregationId?: CongregationId;
      /** Igreja do usuário (padrão: a igreja de teste). */
      organizationId?: OrganizationId;
    } = {},
  ) {
    const email = Email.create(`usuario${n}@igreja.com`);
    const hash = await hasher.hash(PlainPassword.create(TEST_PASSWORD, email));
    const id = UserId.of(uuidFor(500 + n));
    const organizationId = userOptions.organizationId ?? TEST_ORGANIZATION;
    const user = User.restore({
      id,
      organizationId,
      email,
      passwordHash: hash,
      status: userOptions.status ?? 'ACTIVE',
      mustChangePassword: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      assignments: [],
      version: 0,
    });
    if (userOptions.permissions) {
      const role = Role.restore({
        id: RoleId.of(uuidFor(600 + n)),
        organizationId,
        name: RoleName.create(`Papel ${n}`),
        isSystem: false,
        permissions: userOptions.permissions.map((p) => Permission.of(p)),
      });
      await roles.add(role);
      user.assignRole(role.id, userOptions.congregationId ?? null);
    }
    await users.add(user);
    return { id, email: email.value };
  }

  return {
    server: app.getHttpServer() as Parameters<typeof request>[0],
    moduleRef,
    clock,
    admin,
    directory,
    audit,
    addUser,
    signer,
    close: () => app.close(),
  };
}

export type HttpTestApp = Awaited<ReturnType<typeof startHttpTestApp>>;
