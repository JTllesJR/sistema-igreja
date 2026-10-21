import { Controller, Get, Res } from '@nestjs/common';
import type { HealthResponse } from '@igreja/contracts';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * 200 quando tudo está de pé; 503 (com o mesmo corpo do contrato) quando alguma dependência falhou.
   * Define o status direto na resposta, em vez de lançar exceção: o corpo é o contrato do health, não um erro genérico.
   */
  @Get()
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const result = await this.health.check();

    if (result.status !== 'ok') {
      response.status(503);
    }

    return result;
  }
}
