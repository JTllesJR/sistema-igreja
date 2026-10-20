import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@igreja/contracts';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** 200 quando tudo está de pé; 503 (com o mesmo corpo) quando alguma dependência falhou. */
  @Get()
  async check(): Promise<HealthResponse> {
    const result = await this.health.check();

    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }
}
