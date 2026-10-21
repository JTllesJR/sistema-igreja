import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import type { MemberRepository } from '../domain/member.repository.js';
import type { MemberAccess } from './member-access.js';
import { loadVisibleMember } from './member-guards.js';
import { type MemberDetailView, toMemberDetailView } from './views.js';

export interface GetMemberQuery {
  memberId: string;
}

/**
 * Ficha completa do membro. LEITURA DE DADO SENSÍVEL (ADR 0006): a leitura é registrada na trilha ANTES de os dados
 * serem devolvidos, e se o registro falhar a ficha não sai (falha fechada: sem trilha, sem dado).
 */
export class GetMemberUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    query: GetMemberQuery,
  ): Promise<MemberDetailView> {
    const member = await loadVisibleMember(
      this.repository,
      context,
      access,
      query.memberId,
    );
    const history = await this.repository.listHistory(
      context.organizationId,
      member.id,
    );

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.viewed',
      entity: 'member',
      entityId: member.id,
    });

    return toMemberDetailView(member, history, access);
  }
}
