import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import { Congregation } from '../domain/congregation.js';
import { CongregationName } from '../domain/congregation-name.js';
import {
  OrganizationAlreadyExistsError,
  OrganizationNotFoundError,
} from '../domain/errors.js';
import { CongregationId, OrganizationId } from '../domain/ids.js';
import { Organization } from '../domain/organization.js';
import { OrganizationName } from '../domain/organization-name.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { readAddress, readServiceTimes } from './json-columns.js';

type OrganizationRow = Prisma.OrganizationGetPayload<{
  include: { congregations: true };
}>;
type CongregationRow = OrganizationRow['congregations'][number];

/**
 * Repositório do agregado `Organization` sobre PostgreSQL (Prisma).
 * Cumpre o contrato de `describeOrganizationRepositoryContract`, o mesmo que o repositório em memória.
 */
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: OrganizationId): Promise<Organization | null> {
    const row = await this.prisma.organization.findUnique({
      where: { id },
      include: { congregations: true },
    });
    return row ? toDomain(row) : null;
  }

  async add(organization: Organization): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.organization.create({
          data: {
            id: organization.id,
            name: organization.name.value,
            version: organization.version,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new OrganizationAlreadyExistsError(organization.id);
        }
        throw error;
      }

      await tx.congregation.createMany({
        data: organization.congregations.map((c) =>
          toCreateData(organization.id, c),
        ),
      });
    });
  }

  /**
   * Uma transação: ou o agregado inteiro é gravado, ou nada é.
   *
   * 1. Travamento otimista: o UPDATE só acerta a linha se `version` ainda for a lida. Com duas gravações
   *    simultâneas, a segunda espera a primeira confirmar, reavalia a condição, não acha a linha e falha.
   * 2. Congregações, em ORDEM IMPORTANTE (o índice único "uma sede por organização" não é adiável):
   *    desmarca a sede antiga → atualiza as existentes → insere as novas.
   *
   * Limite conhecido: trocar nomes entre duas congregações dentro de uma única gravação (A↔B) violaria o
   * índice de nome único durante as atualizações. Os casos de uso gravam uma operação por vez, então não ocorre.
   */
  async save(organization: Organization): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.updateMany({
        where: { id: organization.id, version: organization.version },
        data: { name: organization.name.value, version: { increment: 1 } },
      });

      if (updated.count === 0) {
        const exists = await tx.organization.findUnique({
          where: { id: organization.id },
          select: { id: true },
        });
        throw exists
          ? new ConcurrencyConflictError()
          : new OrganizationNotFoundError(organization.id);
      }

      await this.syncCongregations(tx, organization);
    });
  }

  private async syncCongregations(
    tx: Prisma.TransactionClient,
    organization: Organization,
  ): Promise<void> {
    const stored = await tx.congregation.findMany({
      where: { organizationId: organization.id },
      select: { id: true, isHeadquarters: true },
    });
    const wasHeadquarters = new Map(
      stored.map((r) => [r.id, r.isHeadquarters]),
    );
    const congregations = organization.congregations;

    // Toda escrita usa a chave composta (organization_id, id): nunca alcança linha de outra organização.
    const key = (c: Congregation) => ({
      organizationId_id: { organizationId: organization.id, id: c.id },
    });

    // 1) Desmarca a sede antiga ANTES de marcar a nova.
    for (const c of congregations) {
      if (!c.isHeadquarters && wasHeadquarters.get(c.id) === true) {
        await tx.congregation.update({
          where: key(c),
          data: { isHeadquarters: false },
        });
      }
    }

    // 2) Atualiza as existentes.
    for (const c of congregations) {
      if (wasHeadquarters.has(c.id)) {
        await tx.congregation.update({ where: key(c), data: toUpdateData(c) });
      }
    }

    // 3) Insere as novas.
    const created = congregations.filter((c) => !wasHeadquarters.has(c.id));
    if (created.length > 0) {
      await tx.congregation.createMany({
        data: created.map((c) => toCreateData(organization.id, c)),
      });
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function toUpdateData(c: Congregation) {
  return {
    name: c.name.value,
    isHeadquarters: c.isHeadquarters,
    status: c.status,
    // Espalhar (`...`) gera um objeto "anônimo", aceito como JSON pelo Prisma; a interface de origem não seria.
    address: c.address ? { ...c.address.toPrimitives() } : Prisma.DbNull,
    serviceTimes: c.serviceTimes.map((s) => ({ ...s.toPrimitives() })),
  };
}

function toCreateData(organizationId: OrganizationId, c: Congregation) {
  return { id: c.id, organizationId, ...toUpdateData(c) };
}

function toDomain(row: OrganizationRow): Organization {
  return Organization.restore({
    id: OrganizationId.of(row.id),
    name: OrganizationName.create(row.name),
    version: row.version,
    congregations: row.congregations.map(toCongregation),
  });
}

function toCongregation(row: CongregationRow): Congregation {
  return Congregation.restore({
    id: CongregationId.of(row.id),
    name: CongregationName.create(row.name),
    isHeadquarters: row.isHeadquarters,
    status: row.status,
    address: readAddress(row.address),
    serviceTimes: readServiceTimes(row.serviceTimes),
  });
}
