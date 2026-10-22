import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { Clock } from '../../../shared/application/clock.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { Address, type AddressInput } from '../../../shared/domain/address.js';
import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { ContactEmail } from '../domain/contact-email.js';
import type { ProfileChanges } from '../domain/member.js';
import type { MemberRepository } from '../domain/member.repository.js';
import { isMemberPosition } from '../domain/member-position.js';
import { PersonName } from '../domain/person-name.js';
import { Phone } from '../domain/phone.js';
import { optionalInput } from './inputs.js';
import type { MemberAccess } from './member-access.js';
import { assertCanWrite, loadVisibleMember } from './member-guards.js';

/** Campo ausente = manter; `null` ou texto em branco = apagar (exceto o nome, que é obrigatório). */
export interface UpdateMemberCommand {
  memberId: string;
  fullName?: string;
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: AddressInput | null;
  /** Ausente = manter. O cargo nunca é apagado: é sempre um dos valores da lista. */
  position?: string;
}

/** UC-06: altera o cadastro. Exige poder ESCREVER na congregação atual do membro. */
export class UpdateMemberUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly clock: Clock,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    command: UpdateMemberCommand,
  ): Promise<void> {
    const member = await loadVisibleMember(
      this.repository,
      context,
      access,
      command.memberId,
    );
    assertCanWrite(access, member);

    const changes: ProfileChanges = {};
    if (command.fullName !== undefined) {
      changes.fullName = PersonName.create(command.fullName);
    }
    const birthDate = optionalInput(command.birthDate, (value) =>
      CalendarDate.parse(value, 'birthDate'),
    );
    if (birthDate !== undefined) changes.birthDate = birthDate;
    const phone = optionalInput(command.phone, (value) => Phone.create(value));
    if (phone !== undefined) changes.phone = phone;
    const email = optionalInput(command.email, (value) =>
      ContactEmail.create(value),
    );
    if (email !== undefined) changes.email = email;
    if (command.address !== undefined) {
      changes.address =
        command.address === null ? null : Address.create(command.address);
    }

    if (command.position !== undefined) {
      if (!isMemberPosition(command.position)) {
        throw new ValidationError('position', 'O cargo informado não existe.');
      }
      changes.position = command.position;
    }

    const changed = member.updateProfile(changes, this.clock.now());
    // Nada mudou de verdade: não há o que gravar nem o que auditar.
    if (changed.length === 0) return;

    await this.repository.save(member);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.updated',
      entity: 'member',
      entityId: member.id,
      // Só os NOMES dos campos, nunca os valores: a trilha não pode virar uma segunda cópia dos dados pessoais.
      metadata: { fields: changed.join(',') },
    });
  }
}
