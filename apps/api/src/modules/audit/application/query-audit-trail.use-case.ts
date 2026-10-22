import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { isUuid } from '../../../shared/domain/uuid.js';
import type { AuditQueryRepository } from '../domain/audit-query.repository.js';
import type { AuditCursor, AuditRecord } from '../domain/audit-record.js';
import { AuditAccessDeniedError } from '../domain/errors.js';
import type { AuditAccess } from './audit-access.js';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

const MODULE_FORMAT = /^[a-z][a-z-]*$/;

export interface QueryAuditTrailQuery {
  actorId?: string | null;
  entity?: string | null;
  entityId?: string | null;
  action?: string | null;
  module?: string | null;
  /** Instante ISO 8601 em UTC. */
  from?: string | null;
  to?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface AuditEntryView {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: AuditRecord['metadata'];
  occurredAt: string;
}

export interface AuditPageView {
  items: AuditEntryView[];
  nextCursor: string | null;
}

/**
 * UC-04: consulta a trilha de auditoria da igreja (filtros por quem fez, dado afetado, ação, módulo e período; página
 * por cursor). A trilha nunca guarda dado pessoal, mas mostra QUEM leu O QUÊ: por isso exige `audit:read` para a igreja
 * toda e a própria consulta é registrada ANTES de devolver (falha fechada, como toda leitura sensível, ADR 0013). A
 * trilha leva só os NOMES dos filtros usados, nunca os valores (um id de membro buscado é dado do titular).
 */
export class QueryAuditTrailUseCase {
  constructor(
    private readonly repository: AuditQueryRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: AuditAccess,
    query: QueryAuditTrailQuery,
  ): Promise<AuditPageView> {
    if (!access.canRead()) throw new AuditAccessDeniedError();

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new ValidationError(
        'limit',
        `O limite deve estar entre 1 e ${MAX_PAGE_SIZE}.`,
      );
    }
    for (const [field, value] of [
      ['actorId', query.actorId],
      ['entityId', query.entityId],
    ] as const) {
      if (value && !isUuid(value)) {
        throw new ValidationError(field, 'Identificador inválido.');
      }
    }
    if (query.module && !MODULE_FORMAT.test(query.module)) {
      throw new ValidationError(
        'module',
        'O módulo deve ter só letras minúsculas e hífen.',
      );
    }
    const from = instant(query.from, 'from');
    const to = instant(query.to, 'to');
    if (from && to && from.getTime() > to.getTime()) {
      throw new ValidationError('from', 'O início vem depois do fim.');
    }
    const before = query.cursor ? decodeCursor(query.cursor) : null;

    // Pede UM a mais: se ele existir, há próxima página (sem contar a tabela inteira, que só cresce).
    const found = await this.repository.search(context.organizationId, {
      actorId: query.actorId || null,
      entity: query.entity || null,
      entityId: query.entityId || null,
      action: query.action || null,
      module: query.module || null,
      from,
      to,
      before,
      limit: limit + 1,
    });
    const page = found.slice(0, limit);
    const last = page.at(-1);

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'audit.queried',
      entity: 'audit_log',
      entityId: null,
      metadata: {
        returned: page.length,
        filters: filterNames(query),
        paged: before !== null,
      },
    });

    return {
      items: page.map((record) => ({
        id: record.id,
        actorId: record.actorId,
        action: record.action,
        entity: record.entity,
        entityId: record.entityId,
        metadata: record.metadata,
        occurredAt: record.occurredAt.toISOString(),
      })),
      nextCursor:
        found.length > limit && last
          ? encodeCursor({ occurredAt: last.occurredAt, id: last.id })
          : null,
    };
  }
}

function instant(raw: string | null | undefined, field: string): Date | null {
  if (!raw) return null;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    throw new ValidationError(field, 'Data e hora inválidas.');
  }
  return value;
}

/** Só os NOMES dos filtros que vieram preenchidos, na ordem fixa. */
function filterNames(query: QueryAuditTrailQuery): string {
  return (
    ['actorId', 'entity', 'entityId', 'action', 'module', 'from', 'to'] as const
  )
    .filter((name) => Boolean(query[name]))
    .join(',');
}

/**
 * O cursor é OPACO para o cliente (texto em base64url), mas não é segredo: a igreja do contexto sempre entra na consulta,
 * então um cursor forjado só pode "pular" dentro da própria trilha de quem consulta.
 */
function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.occurredAt.toISOString(), i: cursor.id }),
  ).toString('base64url');
}

function decodeCursor(raw: string): AuditCursor {
  const invalid = new ValidationError('cursor', 'O cursor é inválido.');
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as { t?: unknown; i?: unknown };
    if (typeof parsed.t !== 'string' || typeof parsed.i !== 'string') {
      throw invalid;
    }
    const occurredAt = new Date(parsed.t);
    if (Number.isNaN(occurredAt.getTime()) || !isUuid(parsed.i)) throw invalid;
    return { occurredAt, id: parsed.i };
  } catch {
    throw invalid;
  }
}
