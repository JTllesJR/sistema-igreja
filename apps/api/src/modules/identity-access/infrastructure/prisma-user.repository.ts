import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import { Email } from '../domain/email.js';
import {
  EmailAlreadyRegisteredError,
  UserNotFoundError,
} from '../domain/errors.js';
import { RoleId, UserId } from '../domain/ids.js';
import { PasswordHash } from '../domain/password-hash.js';
import { RoleAssignment } from '../domain/role-assignment.js';
import { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user.repository.js';

type UserRow = Prisma.UserAccountGetPayload<{ include: { assignments: true } }>;

/**
 * Repositório do agregado `User` sobre PostgreSQL. Cumpre o mesmo contrato do repositório em memória.
 *
 * `save` roda em UMA transação: a conta e as atribuições são gravadas juntas ou não são. O travamento otimista é um
 * `UPDATE ... WHERE version = ?`; com duas gravações simultâneas, a segunda espera a primeira confirmar, reavalia a
 * condição, não acha a linha e falha com conflito.
 */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: UserId): Promise<User | null> {
    const row = await this.prisma.userAccount.findUnique({
      where: { id },
      include: { assignments: true },
    });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    // O e-mail é gravado sempre normalizado (CHECK no banco), então a busca é por igualdade simples e usa o índice.
    const row = await this.prisma.userAccount.findUnique({
      where: { email: email.value },
      include: { assignments: true },
    });
    return row ? toDomain(row) : null;
  }

  async add(user: User): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.userAccount.create({
          data: {
            id: user.id,
            organizationId: user.organizationId,
            email: user.email.value,
            passwordHash: user.passwordHash.value,
            status: user.status,
            failedLoginAttempts: user.failedLoginAttempts,
            lockedUntil: user.lockedUntil,
            lastLoginAt: user.lastLoginAt,
            version: user.version,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) throw new EmailAlreadyRegisteredError();
        throw error;
      }

      await tx.userRoleAssignment.createMany({
        data: user.assignments.map((assignment) => ({
          organizationId: user.organizationId,
          userId: user.id,
          roleId: assignment.roleId,
          congregationId: assignment.congregationId,
        })),
      });
    });
  }

  async save(user: User): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userAccount.updateMany({
        where: { id: user.id, version: user.version },
        data: {
          passwordHash: user.passwordHash.value,
          status: user.status,
          failedLoginAttempts: user.failedLoginAttempts,
          lockedUntil: user.lockedUntil,
          lastLoginAt: user.lastLoginAt,
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        const exists = await tx.userAccount.findUnique({
          where: { id: user.id },
          select: { id: true },
        });
        throw exists ? new ConcurrencyConflictError() : new UserNotFoundError();
      }

      await syncAssignments(tx, user);
    });
  }
}

/** Compara o que está gravado com o agregado: apaga o que saiu e cria o que entrou. */
async function syncAssignments(
  tx: Prisma.TransactionClient,
  user: User,
): Promise<void> {
  const stored = await tx.userRoleAssignment.findMany({
    where: { userId: user.id },
  });
  const keyOf = (roleId: string, congregationId: string | null) =>
    `${roleId}|${congregationId ?? ''}`;

  const wanted = new Map(
    user.assignments.map((a) => [keyOf(a.roleId, a.congregationId), a]),
  );
  const present = new Set(
    stored.map((row) => keyOf(row.roleId, row.congregationId)),
  );

  const toDelete = stored.filter(
    (row) => !wanted.has(keyOf(row.roleId, row.congregationId)),
  );
  if (toDelete.length > 0) {
    await tx.userRoleAssignment.deleteMany({
      where: { id: { in: toDelete.map((row) => row.id) } },
    });
  }

  const toCreate = [...wanted.entries()].filter(([key]) => !present.has(key));
  if (toCreate.length > 0) {
    await tx.userRoleAssignment.createMany({
      data: toCreate.map(([, assignment]) => ({
        organizationId: user.organizationId,
        userId: user.id,
        roleId: assignment.roleId,
        congregationId: assignment.congregationId,
      })),
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function toDomain(row: UserRow): User {
  return User.restore({
    id: UserId.of(row.id),
    organizationId: OrganizationId.of(row.organizationId),
    email: Email.create(row.email),
    passwordHash: PasswordHash.of(row.passwordHash),
    status: row.status,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    assignments: row.assignments.map((assignment) =>
      RoleAssignment.create({
        roleId: RoleId.of(assignment.roleId),
        congregationId: assignment.congregationId
          ? CongregationId.of(assignment.congregationId)
          : null,
      }),
    ),
    version: row.version,
  });
}
