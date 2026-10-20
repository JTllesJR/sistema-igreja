import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/**
 * Cliente de banco único da aplicação.
 *
 * Conexão preguiçosa (o Prisma conecta na primeira consulta): a API sobe mesmo com o banco fora do ar
 * e o /health passa a reportar "degraded", em vez de a aplicação nem iniciar.
 *
 * Convenção: cada módulo só consulta as tabelas que pertencem a ele (ADR 0001).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
