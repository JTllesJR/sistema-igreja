import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { PlainPassword } from '../domain/plain-password.js';
import type { RoleRepository } from '../domain/role.repository.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { TemporaryPasswordResult } from './create-user.use-case.js';
import type { UserCommand } from './disable-user.use-case.js';
import { loadUserOfOrganization } from './load-user.js';
import type { PasswordHasher } from './password-hasher.js';
import type { TemporaryPasswordGenerator } from './temporary-password-generator.js';
import { updateUser } from './update-user.js';
import { toUserSummaryView } from './views.js';

/**
 * Redefine a senha de um usuário da igreja (ADR 0014): gera uma senha temporária nova, derruba todas as sessões dele
 * e volta a exigir a troca no próximo acesso. Sem e-mail, é o único jeito de recuperar uma senha esquecida.
 *
 * Também destrava uma conta bloqueada por tentativas erradas, mas NÃO reativa uma conta desativada.
 */
export class ResetPasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly passwords: TemporaryPasswordGenerator,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    command: UserCommand,
  ): Promise<TemporaryPasswordResult> {
    const target = await loadUserOfOrganization(
      this.users,
      context,
      command.userId,
    );

    const temporaryPassword = this.passwords.generate();
    const hash = await this.hasher.hash(
      PlainPassword.create(temporaryPassword, target.email),
    );

    const updated = await updateUser(this.users, target.id, (user) =>
      user.issueTemporaryPassword(hash),
    );
    await this.sessions.revokeAllForUser(updated.id, this.clock.now());

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'user.password_reset',
      entity: 'user',
      entityId: updated.id,
    });

    return {
      user: toUserSummaryView(
        updated,
        await this.roles.listByOrganization(context.organizationId),
      ),
      temporaryPassword,
    };
  }
}
