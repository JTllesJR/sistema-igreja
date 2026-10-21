import type { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { SessionFamilyId, SessionId, UserId } from '../domain/ids.js';
import { Session } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';

type SessionRow = Prisma.SessionGetPayload<object>;

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: SessionId): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({ where: { tokenHash } });
    return row ? toDomain(row) : null;
  }

  async add(session: Session): Promise<void> {
    await this.prisma.session.create({ data: toRow(session) });
  }

  /**
   * Troca atômica e CONDICIONAL. O `UPDATE ... WHERE rotated_at IS NULL AND revoked_at IS NULL` só acerta a linha
   * se ninguém a trocou nem revogou antes. Com duas requisições simultâneas usando o mesmo token, a segunda espera
   * a primeira confirmar, reavalia a condição, não acha a linha e falha: o caso de uso trata isso como roubo.
   * A criação da próxima sessão está na mesma transação: se falhar, a anterior não fica marcada como trocada.
   */
  async rotate(previous: Session, next: Session): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.session.updateMany({
        where: { id: previous.id, rotatedAt: null, revokedAt: null },
        data: { rotatedAt: previous.rotatedAt },
      });
      if (updated.count === 0) throw new ConcurrencyConflictError();

      await tx.session.create({ data: toRow(next) });
    });
  }

  async revokeFamily(familyId: SessionFamilyId, now: Date): Promise<void> {
    // `revokedAt: null` torna idempotente e preserva o primeiro instante de revogação.
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllForUser(
    userId: UserId,
    now: Date,
    options?: { exceptFamilyId?: SessionFamilyId },
  ): Promise<void> {
    await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options?.exceptFamilyId
          ? { familyId: { not: options.exceptFamilyId } }
          : {}),
      },
      data: { revokedAt: now },
    });
  }
}

function toRow(session: Session): Prisma.SessionUncheckedCreateInput {
  return {
    id: session.id,
    organizationId: session.organizationId,
    userId: session.userId,
    familyId: session.familyId,
    tokenHash: session.tokenHash,
    createdAt: session.createdAt,
    familyStartedAt: session.familyStartedAt,
    expiresAt: session.expiresAt,
    rotatedAt: session.rotatedAt,
    revokedAt: session.revokedAt,
  };
}

function toDomain(row: SessionRow): Session {
  return Session.restore({
    id: SessionId.of(row.id),
    organizationId: OrganizationId.of(row.organizationId),
    userId: UserId.of(row.userId),
    familyId: SessionFamilyId.of(row.familyId),
    tokenHash: row.tokenHash,
    createdAt: row.createdAt,
    familyStartedAt: row.familyStartedAt,
    expiresAt: row.expiresAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt,
  });
}
