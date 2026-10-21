import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';

/**
 * O que vale para toda rota da API (ADR 0011): formato único de erro e limite de taxa por IP.
 * O armazenamento do limite é em memória: serve a uma instância; com várias, será preciso um armazenamento compartilhado.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        throttlers: [
          { ttl: env.THROTTLE_TTL_SECONDS * 1000, limit: env.THROTTLE_LIMIT },
        ],
      }),
    }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class HttpPlatformModule {}
