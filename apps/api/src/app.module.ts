import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityAccessModule } from './modules/identity-access/index.js';
import { OrganizationModule } from './modules/organization/index.js';
import { ConfigModule } from './platform/config/config.module.js';
import { HttpPlatformModule } from './platform/http/http-platform.module.js';

@Module({
  imports: [
    ConfigModule,
    HttpPlatformModule,
    HealthModule,
    OrganizationModule,
    IdentityAccessModule,
  ],
})
export class AppModule {}
