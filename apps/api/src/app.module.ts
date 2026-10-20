import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { ConfigModule } from './platform/config/config.module.js';

@Module({
  imports: [ConfigModule, HealthModule],
})
export class AppModule {}
