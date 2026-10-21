import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { CalendarDate } from '../domain/calendar-date.js';
import { MemberEventId } from '../domain/ids.js';
import type { MemberRepository } from '../domain/member.repository.js';
import { isManualEventType } from '../domain/member-history-event.js';
import type { MemberAccess } from './member-access.js';
import { assertCanWrite, loadVisibleMember } from './member-guards.js';

export interface RecordMemberEventCommand {
  memberId: string;
  /** `BAPTISM` ou `RECEPTION` (os demais eventos o sistema gera sozinho). */
  type: string;
  occurredOn: string;
  notes?: string | null;
}

/** UC-07: registra um fato na história do membro (batismo, recepção). */
export class RecordMemberEventUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    command: RecordMemberEventCommand,
  ): Promise<void> {
    if (!isManualEventType(command.type)) {
      throw new ValidationError(
        'type',
        'O tipo de evento informado não existe.',
      );
    }
    const occurredOn = CalendarDate.parse(command.occurredOn, 'occurredOn');
    const member = await loadVisibleMember(
      this.repository,
      context,
      access,
      command.memberId,
    );
    assertCanWrite(access, member);

    member.recordEvent({
      type: command.type,
      occurredOn,
      notes: command.notes ?? null,
      eventId: MemberEventId.of(this.ids.next()),
      now: this.clock.now(),
    });
    await this.repository.save(member);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.event_recorded',
      entity: 'member',
      entityId: member.id,
      metadata: { type: command.type },
    });
  }
}
