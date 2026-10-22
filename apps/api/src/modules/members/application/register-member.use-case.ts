import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { Address, type AddressInput } from '../../../shared/domain/address.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ContactEmail } from '../domain/contact-email.js';
import { MemberAccessDeniedError } from '../domain/errors.js';
import { MemberEventId, MemberId } from '../domain/ids.js';
import { Member } from '../domain/member.js';
import type { MemberRepository } from '../domain/member.repository.js';
import { isMemberPosition } from '../domain/member-position.js';
import { isMemberStatus } from '../domain/member-status.js';
import { PersonName } from '../domain/person-name.js';
import { Phone } from '../domain/phone.js';
import type { CongregationDirectory } from './congregation-directory.js';
import { optionalInput } from './inputs.js';
import type { MemberAccess } from './member-access.js';
import { assertActiveCongregation } from './member-guards.js';

export interface RegisterMemberCommand {
  congregationId: string;
  fullName: string;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: AddressInput | null;
  /** Padrão: ativo. Útil ao migrar membros que já estão afastados. */
  status?: string;
  /** Padrão: membro (sem cargo). */
  position?: string;
}

/** UC-06: cadastra um membro. Exige poder ESCREVER na congregação de destino, que precisa estar ativa. */
export class RegisterMemberUseCase {
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
    command: RegisterMemberCommand,
  ): Promise<{ id: string }> {
    const congregationId = CongregationId.of(command.congregationId);
    // Primeiro a permissão: quem não pode escrever ali não descobre se a congregação existe.
    if (!access.canWrite(congregationId)) throw new MemberAccessDeniedError();

    // Valida tudo o que não precisa de I/O antes de consultar o banco.
    const status = command.status ?? 'ACTIVE';
    if (!isMemberStatus(status)) {
      throw new ValidationError('status', 'A situação informada não existe.');
    }
    const position = command.position ?? 'MEMBER';
    if (!isMemberPosition(position)) {
      throw new ValidationError('position', 'O cargo informado não existe.');
    }
    const member = Member.register({
      id: MemberId.of(this.ids.next()),
      organizationId: context.organizationId,
      congregationId,
      fullName: PersonName.create(command.fullName),
      birthDate: optionalInput(command.birthDate, (value) =>
        CalendarDate.parse(value, 'birthDate'),
      ),
      phone: optionalInput(command.phone, (value) => Phone.create(value)),
      email: optionalInput(command.email, (value) =>
        ContactEmail.create(value),
      ),
      address: command.address ? Address.create(command.address) : null,
      status,
      position,
      eventId: MemberEventId.of(this.ids.next()),
      now: this.clock.now(),
    });

    await assertActiveCongregation(this.congregations, context, congregationId);
    await this.repository.add(member);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.registered',
      entity: 'member',
      entityId: member.id,
      metadata: { congregationId },
    });

    return { id: member.id };
  }
}
