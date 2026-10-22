import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import { ActorId, OrganizationId } from '../../../shared/domain/identifiers.js';
import type { AuditQueryRepository } from '../domain/audit-query.repository.js';
import type {
  AuditRecord,
  AuditSearchCriteria,
} from '../domain/audit-record.js';

/**
 * Consulta da trilha no PostgreSQL. SOMENTE LEITURA (a escrita é do `PrismaAuditLog`). Toda consulta leva
 * `organization_id` (ADR 0003). A paginação é por CURSOR (instante, id): uma trilha só cresce, e `OFFSET` fica mais lento
 * a cada página.
 */
export class PrismaAuditQueryRepository implements AuditQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    organizationId: OrganizationId,
    criteria: AuditSearchCriteria,
  ): Promise<AuditRecord[]> {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (criteria.module !== null) {
      // O Prisma não escapa os curingas do LIKE: o texto do módulo entra sempre como literal.
      and.push({
        action: { startsWith: `${escapeLikePattern(criteria.module)}.` },
      });
    }
    if (criteria.before !== null) {
      const { occurredAt, id } = criteria.before;
      and.push({
        OR: [
          { occurredAt: { lt: occurredAt } },
          { occurredAt, id: { lt: id } },
        ],
      });
    }

    const rows = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(criteria.actorId === null ? {} : { actorId: criteria.actorId }),
        ...(criteria.entity === null ? {} : { entity: criteria.entity }),
        ...(criteria.entityId === null ? {} : { entityId: criteria.entityId }),
        ...(criteria.action === null ? {} : { action: criteria.action }),
        ...(criteria.from === null && criteria.to === null
          ? {}
          : {
              occurredAt: {
                ...(criteria.from === null ? {} : { gte: criteria.from }),
                ...(criteria.to === null ? {} : { lte: criteria.to }),
              },
            }),
        ...(and.length === 0 ? {} : { AND: and }),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: criteria.limit,
    });

    return rows.map((row) => ({
      id: row.id,
      organizationId: OrganizationId.of(row.organizationId),
      actorId: ActorId.of(row.actorId),
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
      metadata: row.metadata as AuditRecord['metadata'],
      occurredAt: row.occurredAt,
    }));
  }
}

/** Antepõe `\` a `\`, `%` e `_`: no LIKE do PostgreSQL, a barra invertida é o escape padrão. */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}
