import type { PrismaService } from '../../../platform/database/prisma.service.js';
import {
  CongregationId,
  type OrganizationId,
} from '../../../shared/domain/identifiers.js';
import type {
  CongregationSummary,
  OrganizationQueries,
} from '../application/organization-queries.js';

/** Consulta leve: não carrega o agregado inteiro, só pergunta se a linha existe. */
export class PrismaOrganizationQueries implements OrganizationQueries {
  constructor(private readonly prisma: PrismaService) {}

  async organizationExists(organizationId: OrganizationId): Promise<boolean> {
    const row = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    return row !== null;
  }

  async findCongregation(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<CongregationSummary | null> {
    // O filtro por igreja está na própria consulta: id de outra igreja não acha nada.
    const row = await this.prisma.congregation.findFirst({
      where: { id: congregationId, organizationId },
      select: { id: true, status: true },
    });
    return row ? { id: CongregationId.of(row.id), status: row.status } : null;
  }
}
