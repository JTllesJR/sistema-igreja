import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import { UuidV7IdGenerator } from '../../shared/infrastructure/uuid-v7-id-generator.js';
import { AUDIT_LOG } from './audit.tokens.js';
import { PrismaAuditLog } from './infrastructure/prisma-audit-log.js';

/** Dono da tabela `audit_log` (ADR 0001): os outros módulos só usam a porta `AuditLog`, exportada aqui. */
@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: AUDIT_LOG,
      useFactory: (prisma: PrismaService, ids: IdGenerator) =>
        new PrismaAuditLog(prisma, ids),
      inject: [PrismaService, 'AUDIT_ID_GENERATOR'],
    },
    {
      provide: 'AUDIT_ID_GENERATOR',
      useFactory: () => new UuidV7IdGenerator(),
    },
  ],
  exports: [AUDIT_LOG],
})
export class AuditModule {}
