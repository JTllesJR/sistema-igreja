import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { MemberAccessDeniedError } from '../domain/errors.js';
import { MemberEventId } from '../domain/ids.js';
import type { MemberRepository } from '../domain/member.repository.js';
import type { CongregationDirectory } from './congregation-directory.js';
import type { MemberAccess } from './member-access.js';
import {
  assertActiveCongregation,
  assertCanWrite,
  loadVisibleMember,
} from './member-guards.js';

export interface TransferMemberCommand {
  memberId: string;
  /** Congregação de destino. */
  congregationId: string;
}

/**
 * UC-10: transfere o membro para outra congregação da MESMA igreja. Exige poder escrever na congregação de ORIGEM e na
 * de DESTINO: ninguém "empurra" um membro para uma congregação onde não tem autoridade, nem o "puxa" de uma onde não tem.
 */
export class TransferMemberUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly congregations: CongregationDirectory,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    command: TransferMemberCommand,
  ): Promise<void> {
    const destination = CongregationId.of(command.congregationId);
    const member = await loadVisibleMember(
      this.repository,
      context,
      access,
      command.memberId,
    );
    assertCanWrite(access, member);
    if (!access.canWrite(destination)) throw new MemberAccessDeniedError();
    await assertActiveCongregation(this.congregations, context, destination);

    const from = member.congregationId;
    member.transferTo(
      destination,
      MemberEventId.of(this.ids.next()),
      this.clock.now(),
    );
    await this.repository.save(member);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.transferred',
      entity: 'member',
      entityId: member.id,
      metadata: { from, to: destination },
    });
  }
}
