import type { OrganizationId } from '../../../../shared/domain/identifiers.js';
import type { AuditQueryRepository } from '../audit-query.repository.js';
import type { AuditRecord, AuditSearchCriteria } from '../audit-record.js';

/** Consulta da trilha em memória, para os testes dos casos de uso. Os registros entram por `seed`. */
export class InMemoryAuditQueryRepository implements AuditQueryRepository {
  readonly #records: AuditRecord[] = [];

  seed(...records: AuditRecord[]): void {
    this.#records.push(...records);
  }

  search(
    organizationId: OrganizationId,
    criteria: AuditSearchCriteria,
  ): Promise<AuditRecord[]> {
    const before = criteria.before;
    const matches = this.#records
      .filter(
        (r) =>
          r.organizationId === organizationId &&
          (criteria.actorId === null || r.actorId === criteria.actorId) &&
          (criteria.entity === null || r.entity === criteria.entity) &&
          (criteria.entityId === null || r.entityId === criteria.entityId) &&
          (criteria.action === null || r.action === criteria.action) &&
          (criteria.module === null ||
            r.action.startsWith(`${criteria.module}.`)) &&
          (criteria.from === null ||
            r.occurredAt.getTime() >= criteria.from.getTime()) &&
          (criteria.to === null ||
            r.occurredAt.getTime() <= criteria.to.getTime()) &&
          (before === null ||
            r.occurredAt.getTime() < before.occurredAt.getTime() ||
            (r.occurredAt.getTime() === before.occurredAt.getTime() &&
              r.id < before.id)),
      )
      .sort(
        (a, b) =>
          b.occurredAt.getTime() - a.occurredAt.getTime() ||
          b.id.localeCompare(a.id),
      );
    return Promise.resolve(matches.slice(0, criteria.limit));
  }
}
