import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { MemberEventId } from '../domain/ids.js';
import type { MemberRepository } from '../domain/member.repository.js';
import { isMemberStatus } from '../domain/member-status.js';
import type { MemberAccess } from './member-access.js';
import { assertCanWrite, loadVisibleMember } from './member-guards.js';

export interface ChangeMemberStatusCommand {
  memberId: string;
  status: string;
}

/** Muda a situação do membro (dado sensível) e registra de onde para onde na história. */
export class ChangeMemberStatusUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    command: ChangeMemberStatusCommand,
  ): Promise<void> {
    if (!isMemberStatus(command.status)) {
      throw new ValidationError('status', 'A situação informada não existe.');
    }
    const member = await loadVisibleMember(
      this.repository,
      context,
      access,
      command.memberId,
    );
    assertCanWrite(access, member);

    const from = member.status;
    member.changeStatus(
      command.status,
      MemberEventId.of(this.ids.next()),
      this.clock.now(),
    );
    await this.repository.save(member);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.status_changed',
      entity: 'member',
      entityId: member.id,
      metadata: { from, to: command.status },
    });
  }
}
