import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import type { AuditLog } from '../../shared/application/audit-log.js';
import { QueryAuditTrailUseCase } from './application/query-audit-trail.use-case.js';
import { AUDIT_LOG, AUDIT_QUERY_REPOSITORY } from './audit.tokens.js';
import { AuditModule } from './audit.module.js';
import type { AuditQueryRepository } from './domain/audit-query.repository.js';
import { PrismaAuditQueryRepository } from './infrastructure/prisma-audit-query.repository.js';
import { AuditController } from './presentation/http/audit.controller.js';

/**
 * A CONSULTA à trilha (UC-04, ADR 0017), separada do `AuditModule` (a escrita). A separação evita um ciclo de
 * importações: o controller usa a política de acesso do `identity-access`, que por sua vez importa o `AuditModule` para
 * gravar. Entra no `AppModule` pelo ponto de entrada `trail.ts`.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [AuditController],
  providers: [
    {
      provide: AUDIT_QUERY_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaAuditQueryRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: QueryAuditTrailUseCase,
      useFactory: (repository: AuditQueryRepository, audit: AuditLog) =>
        new QueryAuditTrailUseCase(repository, audit),
      inject: [AUDIT_QUERY_REPOSITORY, AUDIT_LOG],
    },
  ],
})
export class AuditTrailModule {}
