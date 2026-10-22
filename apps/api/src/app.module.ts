import { Module } from '@nestjs/common';
import { AuditModule } from './modules/audit/index.js';
import { AuditTrailModule } from './modules/audit/trail.js';
import { FinanceModule } from './modules/finance/index.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityAccessModule } from './modules/identity-access/index.js';
import { MembersModule } from './modules/members/index.js';
import { OrganizationModule } from './modules/organization/index.js';
import { ConfigModule } from './platform/config/config.module.js';
import { HttpPlatformModule } from './platform/http/http-platform.module.js';
import { OpenApiModule } from './platform/openapi/openapi.module.js';
import { PermissionCatalogModule } from './permission-catalog.module.js';

@Module({
  imports: [
    ConfigModule,
    HttpPlatformModule,
    OpenApiModule,
    PermissionCatalogModule,
    HealthModule,
    OrganizationModule,
    IdentityAccessModule,
    AuditModule,
    AuditTrailModule,
    MembersModule,
    FinanceModule,
  ],
})
export class AppModule {}
