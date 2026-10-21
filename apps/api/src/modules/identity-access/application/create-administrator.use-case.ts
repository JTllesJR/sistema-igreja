import type { IdGenerator } from '../../../shared/application/id-generator.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { Email } from '../domain/email.js';
import {
  EmailAlreadyRegisteredError,
  UnknownOrganizationError,
} from '../domain/errors.js';
import { RoleId, UserId } from '../domain/ids.js';
import { PlainPassword } from '../domain/plain-password.js';
import { Role } from '../domain/role.js';
import type { RoleRepository } from '../domain/role.repository.js';
import { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { OrganizationDirectory } from './organization-directory.js';
import type { PasswordHasher } from './password-hasher.js';

export interface CreateAdministratorCommand {
  organizationId: string;
  email: string;
  password: string;
}

export interface CreateAdministratorResult {
  userId: UserId;
  roleId: RoleId;
}

/**
 * Cria um administrador da igreja (parte do UC-03 que cabe ao operador). Executado pela linha de comando,
 * por isso não recebe `RequestContext`: ainda não há ninguém autenticado para criar o primeiro usuário.
 *
 * O papel de sistema "Administrador" da igreja é criado aqui, de forma idempotente, se ainda não existir.
 */
export class CreateAdministratorUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly organizations: OrganizationDirectory,
  ) {}

  async execute(
    command: CreateAdministratorCommand,
  ): Promise<CreateAdministratorResult> {
    // Valida tudo o que não precisa de I/O antes de gastar hash ou consultar o banco.
    const organizationId = OrganizationId.of(command.organizationId);
    const email = Email.create(command.email);
    const password = PlainPassword.create(command.password, email);

    if (!(await this.organizations.exists(organizationId))) {
      throw new UnknownOrganizationError();
    }
    if (await this.users.findByEmail(email))
      throw new EmailAlreadyRegisteredError();

    const role = await this.ensureAdministratorRole(organizationId);

    const user = User.register({
      id: UserId.of(this.ids.next()),
      organizationId,
      email,
      passwordHash: await this.hasher.hash(password),
    });
    user.assignRole(role.id);
    await this.users.add(user);

    return { userId: user.id, roleId: role.id };
  }

  private async ensureAdministratorRole(
    organizationId: OrganizationId,
  ): Promise<Role> {
    const existing = await this.roles.findAdministrator(organizationId);
    if (existing) return existing;

    const role = Role.administrator({
      id: RoleId.of(this.ids.next()),
      organizationId,
    });
    await this.roles.add(role);
    return role;
  }
}
