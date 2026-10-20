import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@igreja/contracts';
import { PrismaService } from '../../platform/database/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly db: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const database = await this.pingDatabase();

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      checks: { database },
    };
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      await this.db.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }
}
