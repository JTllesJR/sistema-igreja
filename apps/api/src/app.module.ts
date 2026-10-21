import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { OrganizationModule } from './modules/organization/index.js';
import { ConfigModule } from './platform/config/config.module.js';

@Module({
  imports: [ConfigModule, HealthModule, OrganizationModule],
})
export class AppModule {}
