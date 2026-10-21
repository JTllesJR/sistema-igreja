import type { PrismaService } from '../../../platform/database/prisma.service.js';
import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { OrganizationQueries } from '../application/organization-queries.js';

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
}
