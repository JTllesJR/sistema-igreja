import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { ENV } from '../../platform/config/config.module.js';
import type { Env } from '../../platform/config/env.js';
import type { Clock } from '../../shared/application/clock.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '../../shared/infrastructure/uuid-v7-id-generator.js';
import {
  ORGANIZATION_QUERIES,
  OrganizationModule,
} from '../organization/index.js';
import type { OrganizationQueries } from '../organization/index.js';
import type { AccessTokenSigner } from './application/access-token-signer.js';
import { AuthenticateUseCase } from './application/authenticate.use-case.js';
import { ChangeOwnPasswordUseCase } from './application/change-own-password.use-case.js';
import { CreateAdministratorUseCase } from './application/create-administrator.use-case.js';
import { GetAccessPolicyUseCase } from './application/get-access-policy.use-case.js';
import { GetCurrentUserUseCase } from './application/get-current-user.use-case.js';
import { ListRolesUseCase } from './application/list-roles.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import type { OrganizationDirectory } from './application/organization-directory.js';
import type { PasswordHasher } from './application/password-hasher.js';
import type { RefreshTokenCodec } from './application/refresh-token-codec.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import {
  DEFAULT_SESSION_POLICY,
  type SessionPolicy,
} from './domain/session.js';
import type { RoleRepository } from './domain/role.repository.js';
import type { SessionRepository } from './domain/session.repository.js';
import type { UserRepository } from './domain/user.repository.js';
import { Argon2PasswordHasher } from './infrastructure/argon2-password-hasher.js';
import { JoseAccessTokenSigner } from './infrastructure/jose-access-token-signer.js';
import { OrganizationQueriesDirectory } from './infrastructure/organization-queries-directory.js';
import { PrismaRoleRepository } from './infrastructure/prisma-role.repository.js';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository.js';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository.js';
import { Sha256RefreshTokenCodec } from './infrastructure/sha256-refresh-token-codec.js';
import { AuthController } from './presentation/http/auth.controller.js';
import { AuthGuard } from './presentation/http/auth.guard.js';
import { RolesController } from './presentation/http/roles.controller.js';
import {
  ACCESS_TOKEN_SIGNER,
  ACCESS_TOKEN_VERIFIER,
  CLOCK,
  ID_GENERATOR,
  ORGANIZATION_DIRECTORY,
  PASSWORD_HASHER,
  REFRESH_TOKEN_CODEC,
  ROLE_REPOSITORY,
  SESSION_POLICY,
  SESSION_REPOSITORY,
  USER_REPOSITORY,
} from './identity-access.tokens.js';

const DAY_MS = 24 * 60 * 60_000;

// Raiz de composição: os casos de uso não têm decorators do Nest (a camada application é pura); aqui cada porta é
// ligada à sua implementação e as configurações vêm do ambiente já validado.
@Module({
  imports: [DatabaseModule, OrganizationModule],
  controllers: [AuthController, RolesController],
  providers: [
    // Guard global que nega por padrão (ADR 0011): vale para TODAS as rotas de TODOS os módulos.
    { provide: APP_GUARD, useClass: AuthGuard },

    // Repositórios
    {
      provide: USER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaUserRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ROLE_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaRoleRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: SESSION_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaSessionRepository(prisma),
      inject: [PrismaService],
    },

    // Segurança
    { provide: PASSWORD_HASHER, useFactory: () => new Argon2PasswordHasher() },
    {
      provide: ACCESS_TOKEN_SIGNER,
      useFactory: (env: Env) =>
        new JoseAccessTokenSigner({
          secret: env.JWT_SECRET,
          ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
        }),
      inject: [ENV],
    },
    // Mesma instância (e mesma chave) emite e confere o token.
    { provide: ACCESS_TOKEN_VERIFIER, useExisting: ACCESS_TOKEN_SIGNER },
    {
      provide: REFRESH_TOKEN_CODEC,
      useFactory: () => new Sha256RefreshTokenCodec(),
    },
    {
      provide: SESSION_POLICY,
      useFactory: (env: Env): SessionPolicy => ({
        idleMs: env.REFRESH_TOKEN_TTL_DAYS * DAY_MS,
        absoluteMs: DEFAULT_SESSION_POLICY.absoluteMs,
      }),
      inject: [ENV],
    },

    // Infraestrutura geral e ponte com o módulo organization
    { provide: CLOCK, useFactory: () => new SystemClock() },
    { provide: ID_GENERATOR, useFactory: () => new UuidV7IdGenerator() },
    {
      provide: ORGANIZATION_DIRECTORY,
      useFactory: (queries: OrganizationQueries) =>
        new OrganizationQueriesDirectory(queries),
      inject: [ORGANIZATION_QUERIES],
    },

    // Casos de uso
    {
      provide: CreateAdministratorUseCase,
      useFactory: (
        users: UserRepository,
        roles: RoleRepository,
        hasher: PasswordHasher,
        ids: IdGenerator,
        organizations: OrganizationDirectory,
      ) =>
        new CreateAdministratorUseCase(
          users,
          roles,
          hasher,
          ids,
          organizations,
        ),
      inject: [
        USER_REPOSITORY,
        ROLE_REPOSITORY,
        PASSWORD_HASHER,
        ID_GENERATOR,
        ORGANIZATION_DIRECTORY,
      ],
    },
    {
      provide: AuthenticateUseCase,
      useFactory: (
        users: UserRepository,
        roles: RoleRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        signer: AccessTokenSigner,
        codec: RefreshTokenCodec,
        ids: IdGenerator,
        clock: Clock,
        policy: SessionPolicy,
      ) =>
        new AuthenticateUseCase(
          users,
          roles,
          sessions,
          hasher,
          signer,
          codec,
          ids,
          clock,
          policy,
        ),
      inject: [
        USER_REPOSITORY,
        ROLE_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHER,
        ACCESS_TOKEN_SIGNER,
        REFRESH_TOKEN_CODEC,
        ID_GENERATOR,
        CLOCK,
        SESSION_POLICY,
      ],
    },
    {
      provide: RefreshSessionUseCase,
      useFactory: (
        users: UserRepository,
        sessions: SessionRepository,
        signer: AccessTokenSigner,
        codec: RefreshTokenCodec,
        ids: IdGenerator,
        clock: Clock,
        policy: SessionPolicy,
      ) =>
        new RefreshSessionUseCase(
          users,
          sessions,
          signer,
          codec,
          ids,
          clock,
          policy,
        ),
      inject: [
        USER_REPOSITORY,
        SESSION_REPOSITORY,
        ACCESS_TOKEN_SIGNER,
        REFRESH_TOKEN_CODEC,
        ID_GENERATOR,
        CLOCK,
        SESSION_POLICY,
      ],
    },
    {
      provide: LogoutUseCase,
      useFactory: (
        sessions: SessionRepository,
        codec: RefreshTokenCodec,
        clock: Clock,
      ) => new LogoutUseCase(sessions, codec, clock),
      inject: [SESSION_REPOSITORY, REFRESH_TOKEN_CODEC, CLOCK],
    },
    {
      provide: GetCurrentUserUseCase,
      useFactory: (users: UserRepository, roles: RoleRepository) =>
        new GetCurrentUserUseCase(users, roles),
      inject: [USER_REPOSITORY, ROLE_REPOSITORY],
    },
    {
      provide: GetAccessPolicyUseCase,
      useFactory: (users: UserRepository, roles: RoleRepository) =>
        new GetAccessPolicyUseCase(users, roles),
      inject: [USER_REPOSITORY, ROLE_REPOSITORY],
    },
    {
      provide: ListRolesUseCase,
      useFactory: (roles: RoleRepository, ids: IdGenerator) =>
        new ListRolesUseCase(roles, ids),
      inject: [ROLE_REPOSITORY, ID_GENERATOR],
    },
    {
      provide: ChangeOwnPasswordUseCase,
      useFactory: (
        users: UserRepository,
        sessions: SessionRepository,
        hasher: PasswordHasher,
        clock: Clock,
      ) => new ChangeOwnPasswordUseCase(users, sessions, hasher, clock),
      inject: [USER_REPOSITORY, SESSION_REPOSITORY, PASSWORD_HASHER, CLOCK],
    },
  ],
  // Exportados para o comando do operador e para os testes; os controllers e o guard já ficam dentro do módulo.
  exports: [
    CreateAdministratorUseCase,
    AuthenticateUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetCurrentUserUseCase,
    GetAccessPolicyUseCase,
    ChangeOwnPasswordUseCase,
  ],
})
export class IdentityAccessModule {}
