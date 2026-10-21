import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { MemberAccessDeniedError } from '../domain/errors.js';
import { MemberEventId } from '../domain/ids.js';
import type { MemberRepository } from '../domain/member.repository.js';
import type { MemberAccess } from './member-access.js';
import { loadVisibleMember } from './member-guards.js';

export interface AnonymizeMemberCommand {
  memberId: string;
}

/**
 * Apaga os dados pessoais de um membro (pedido do titular, LGPD, ADR 0006). IRREVERSÍVEL. Exige a permissão para a
 * igreja toda. A trilha de auditoria registra QUEM apagou e QUANDO, e nada do que foi apagado.
 */
export class AnonymizeMemberUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    command: AnonymizeMemberCommand,
  ): Promise<void> {
    if (!access.canAnonymize()) throw new MemberAccessDeniedError();
    const member = await loadVisibleMember(
      this.repository,
      context,
      access,
      command.memberId,
    );

    member.anonymize(MemberEventId.of(this.ids.next()), this.clock.now());
    await this.repository.save(member);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.anonymized',
      entity: 'member',
      entityId: member.id,
    });
  }
}
