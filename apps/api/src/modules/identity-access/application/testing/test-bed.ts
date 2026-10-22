import type { RequestContext } from '../../../../shared/application/request-context.js';
import {
  ActorId,
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { FixedClock } from '../../../../shared/testing/fixed-clock.js';
import { InMemoryAuditLog } from '../../../../shared/testing/in-memory-audit-log.js';
import { SequentialIdGenerator } from '../../../../shared/testing/sequential-id-generator.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { Email } from '../../domain/email.js';
import { type RoleId, UserId } from '../../domain/ids.js';
import { PlainPassword } from '../../domain/plain-password.js';
import type { Role } from '../../domain/role.js';
import { User } from '../../domain/user.js';
import { InMemoryRoleRepository } from '../../domain/testing/in-memory-role.repository.js';
import { InMemorySessionRepository } from '../../domain/testing/in-memory-session.repository.js';
import { InMemoryUserRepository } from '../../domain/testing/in-memory-user.repository.js';
import { NOW } from '../../domain/testing/fixtures.js';
import { DEFAULT_SESSION_POLICY } from '../../domain/session.js';
import { AuthenticateUseCase } from '../authenticate.use-case.js';
import { ChangeOwnPasswordUseCase } from '../change-own-password.use-case.js';
import { CreateAdministratorUseCase } from '../create-administrator.use-case.js';
import { GetAccessPolicyUseCase } from '../get-access-policy.use-case.js';
import { GetCurrentUserUseCase } from '../get-current-user.use-case.js';
import { LogoutUseCase } from '../logout.use-case.js';
import { RefreshSessionUseCase } from '../refresh-session.use-case.js';
import {
  FakeAccessTokenSigner,
  FakeTemporaryPasswordGenerator,
  FakeOrganizationDirectory,
  FakePasswordHasher,
  FakeRefreshTokenCodec,
} from './fakes.js';

export const ADMIN_EMAIL = 'admin@igreja.com';
export const ADMIN_PASSWORD = 'senha-super-segura-1';
export const USER_PASSWORD = 'senha-do-usuario-1';
export const ORGANIZATION = OrganizationId.of(uuidFor(1));
/** Duas congregações DA igreja de teste: uma ativa e uma inativa. */
export const CONGREGATION = CongregationId.of(uuidFor(1001));
export const INACTIVE_CONGREGATION = CongregationId.of(uuidFor(1002));
export const OTHER_CONGREGATION = CongregationId.of(uuidFor(1003));

/**
 * Cenário padrão: uma igreja conhecida, um administrador já criado (pelo próprio caso de uso, como no uso real)
 * e todos os casos de uso montados sobre repositórios em memória e fakes.
 */
export async function anAuthBed() {
  const users = new InMemoryUserRepository();
  const roles = new InMemoryRoleRepository();
  const sessions = new InMemorySessionRepository();
  const hasher = new FakePasswordHasher();
  const signer = new FakeAccessTokenSigner();
  const codec = new FakeRefreshTokenCodec();
  const ids = new SequentialIdGenerator(100_000);
  const clock = new FixedClock(NOW);
  const organizations = new FakeOrganizationDirectory();
  organizations.add(ORGANIZATION);
  organizations.addCongregation(ORGANIZATION, CONGREGATION);
  organizations.addCongregation(ORGANIZATION, OTHER_CONGREGATION);
  organizations.addCongregation(
    ORGANIZATION,
    INACTIVE_CONGREGATION,
    'INACTIVE',
  );
  const policy = DEFAULT_SESSION_POLICY;
  const audit = new InMemoryAuditLog();
  const generator = new FakeTemporaryPasswordGenerator();

  const createAdministrator = new CreateAdministratorUseCase(
    users,
    roles,
    hasher,
    ids,
    organizations,
  );
  const admin = await createAdministrator.execute({
    organizationId: ORGANIZATION,
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  const contextOf = (userId: UserId): RequestContext => ({
    organizationId: ORGANIZATION,
    actorId: ActorId.of(userId),
  });

  const authenticate = new AuthenticateUseCase(
    users,
    roles,
    sessions,
    hasher,
    signer,
    codec,
    ids,
    clock,
    policy,
  );

  return {
    users,
    roles,
    sessions,
    hasher,
    signer,
    codec,
    ids,
    clock,
    organizations,
    audit,
    generator,
    policy,
    admin,
    adminContext: contextOf(admin.userId),
    contextOf,
    createAdministrator,
    authenticate,
    refresh: new RefreshSessionUseCase(
      users,
      sessions,
      signer,
      codec,
      ids,
      clock,
      policy,
    ),
    logout: new LogoutUseCase(sessions, codec, clock),
    currentUser: new GetCurrentUserUseCase(users, roles),
    accessPolicy: new GetAccessPolicyUseCase(users, roles),
    changePassword: new ChangeOwnPasswordUseCase(
      users,
      sessions,
      hasher,
      clock,
    ),
    login: (password = ADMIN_PASSWORD, email = ADMIN_EMAIL) =>
      authenticate.execute({ email, password }),
    /** O papel padrão da igreja de teste com este nome (`Secretário`, `Dirigente`, `Administrador`). */
    roleNamed: async (name: string): Promise<Role> => {
      const found = (await roles.listByOrganization(ORGANIZATION)).find(
        (role) => role.name.value === name,
      );
      if (!found) throw new Error(`Papel de teste ausente: ${name}`);
      return found;
    },
    /** Usuário comum da igreja de teste, com a senha `USER_PASSWORD` e (opcional) uma atribuição. */
    addUser: async (
      email: string,
      options: {
        organizationId?: OrganizationId;
        roleId?: RoleId;
        congregationId?: CongregationId;
        status?: 'ACTIVE' | 'DISABLED';
        mustChangePassword?: boolean;
      } = {},
    ): Promise<User> => {
      const parsed = Email.create(email);
      const user = User.register({
        id: UserId.of(ids.next()),
        organizationId: options.organizationId ?? ORGANIZATION,
        email: parsed,
        passwordHash: await hasher.hash(
          PlainPassword.create(USER_PASSWORD, parsed),
        ),
        mustChangePassword: options.mustChangePassword ?? false,
      });
      if (options.roleId) {
        user.assignRole(options.roleId, options.congregationId ?? null);
      }
      if (options.status === 'DISABLED') user.disable();
      await users.add(user);
      return user;
    },
  };
}
