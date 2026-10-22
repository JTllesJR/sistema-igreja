import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import type { MemberRepository } from '../domain/member.repository.js';
import { MEMBER_STATUSES, type MemberStatus } from '../domain/member-status.js';
import type { MemberAccess } from './member-access.js';

export interface MemberStatsQuery {
  /** Só uma congregação. Ausente = tudo o que o usuário pode ver (a visão consolidada, UC-16, para quem vê a igreja toda). */
  congregationId?: string | null;
}

/** Quantos membros em cada situação; toda situação aparece, mesmo com zero. */
export type StatusCounts = Record<MemberStatus, number>;

export interface MemberStatsView {
  /** `ORGANIZATION` = a igreja toda; `CONGREGATIONS` = só o que o escopo do usuário alcança. */
  scope: 'ORGANIZATION' | 'CONGREGATIONS';
  totals: StatusCounts;
  /** Só as congregações com pelo menos um membro, em ordem de id. */
  byCongregation: { congregationId: string; counts: StatusCounts }[];
}

/**
 * UC-16 (parte de membros): quantos membros há em cada situação, por congregação. A contagem é feita no banco e só
 * números saem dele. Mesmo sem nome de ninguém, é leitura sobre dado sensível (situação espiritual, ADR 0006), então
 * respeita o escopo como a lista (o filtro só estreita) e é registrada antes de devolver (falha fechada, ADR 0013).
 */
export class GetMemberStatsUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    query: MemberStatsQuery,
  ): Promise<MemberStatsView> {
    const readable = access.readableCongregations();
    let congregationIds = readable === null ? null : [...readable];
    if (query.congregationId) {
      const wanted = CongregationId.of(query.congregationId);
      congregationIds =
        readable === null || readable.includes(wanted) ? [wanted] : [];
    }

    const rows = await this.repository.countByStatus(
      context.organizationId,
      congregationIds,
    );

    const totals = zeroCounts();
    const byCongregation = new Map<string, StatusCounts>();
    for (const row of rows) {
      totals[row.status] += row.count;
      const counts = byCongregation.get(row.congregationId) ?? zeroCounts();
      counts[row.status] += row.count;
      byCongregation.set(row.congregationId, counts);
    }

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.stats_read',
      entity: 'member',
      entityId: null,
      metadata: { filteredByCongregation: Boolean(query.congregationId) },
    });

    return {
      scope: congregationIds === null ? 'ORGANIZATION' : 'CONGREGATIONS',
      totals,
      byCongregation: [...byCongregation.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([congregationId, counts]) => ({ congregationId, counts })),
    };
  }
}

function zeroCounts(): StatusCounts {
  return Object.fromEntries(
    MEMBER_STATUSES.map((status) => [status, 0]),
  ) as StatusCounts;
}
