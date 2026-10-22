import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { Email } from '../domain/email.js';
import { EmailAlreadyRegisteredError } from '../domain/errors.js';
import { RoleId, UserId } from '../domain/ids.js';
import { PlainPassword } from '../domain/plain-password.js';
import type { RoleRepository } from '../domain/role.repository.js';
import { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { OrganizationDirectory } from './organization-directory.js';
import type { PasswordHasher } from './password-hasher.js';
import { resolveAssignableRole } from './resolve-assignable-role.js';
import type { TemporaryPasswordGenerator } from './temporary-password-generator.js';
import { type UserSummaryView, toUserSummaryView } from './views.js';

export interface CreateUserCommand {
  email: string;
  roleId: string;
  /** Nulo = o papel vale para a igreja toda. */
  congregationId: string | null;
}

/** O usuário criado e a senha temporária, que só existe neste retorno: no armazenamento fica apenas o hash. */
export interface TemporaryPasswordResult {
  user: UserSummaryView;
  temporaryPassword: string;
}

/**
 * Cria um usuário da igreja com o primeiro papel e uma SENHA TEMPORÁRIA (UC-03, versão enxuta do ADR 0014).
 *
 * Sem e-mail automático (a hospedagem ainda não existe, ADR 0007), o administrador recebe a senha UMA vez e a repassa
 * à pessoa. Ela entra com essa senha e é obrigada a trocá-la antes de qualquer outra coisa (o guard garante).
 */
export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly passwords: TemporaryPasswordGenerator,
    private readonly organizations: OrganizationDirectory,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    command: CreateUserCommand,
  ): Promise<TemporaryPasswordResult> {
    // O que não precisa de I/O primeiro: e-mail e papel malformados não custam hash nem consulta.
    const email = Email.create(command.email);
    const roleId = RoleId.of(command.roleId);
    const congregationId =
      command.congregationId === null
        ? null
        : CongregationId.of(command.congregationId);

    await resolveAssignableRole(
      this.roles,
      this.organizations,
      context,
      roleId,
      congregationId,
    );
    // O e-mail é único no sistema inteiro (ADR 0010): a mensagem de "já existe" vale mesmo para outra igreja.
    if (await this.users.findByEmail(email)) {
      throw new EmailAlreadyRegisteredError();
    }

    const temporaryPassword = this.passwords.generate();
    const user = User.register({
      id: UserId.of(this.ids.next()),
      organizationId: context.organizationId,
      email,
      passwordHash: await this.hasher.hash(
        PlainPassword.create(temporaryPassword, email),
      ),
      mustChangePassword: true,
    });
    user.assignRole(roleId, congregationId);
    await this.users.add(user);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'user.created',
      entity: 'user',
      entityId: user.id,
      metadata: { roleId, congregationId },
    });

    return {
      user: toUserSummaryView(
        user,
        await this.roles.listByOrganization(context.organizationId),
      ),
      temporaryPassword,
    };
  }
}
