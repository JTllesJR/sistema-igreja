import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import type {
  AuditEntry,
  AuditLog,
} from '../../../shared/application/audit-log.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';

/**
 * Trilha de auditoria no PostgreSQL. SOMENTE `INSERT`: um gatilho no banco recusa `UPDATE` e `DELETE` em `audit_log`
 * (migration `*_members_audit`), então nem um erro deste código consegue reescrever o passado.
 *
 * O instante vem do banco (`occurred_at DEFAULT now()`), não do aplicativo: quem registra não escolhe a hora.
 */
export class PrismaAuditLog implements AuditLog {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: this.ids.next(),
        organizationId: entry.organizationId,
        actorId: entry.actorId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        ...(entry.metadata
          ? { metadata: entry.metadata as Prisma.InputJsonObject }
          : {}),
      },
    });
  }
}
