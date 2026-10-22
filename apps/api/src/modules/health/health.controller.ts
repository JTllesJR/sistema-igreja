import { Controller, Get, Res } from '@nestjs/common';
import type { HealthResponse } from '@igreja/contracts';
import type { Response } from 'express';
import { Public } from '../../platform/http/access-control.js';
import { HealthService } from './health.service.js';
import { healthResponseSchema } from '@igreja/contracts';
import { ApiDoc } from '../../platform/openapi/api-doc.decorator.js';

// Aberto de propósito: monitoramento e orquestradores consultam sem login (ADR 0011).
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * 200 quando tudo está de pé; 503 (com o mesmo corpo do contrato) quando alguma dependência falhou.
   * Define o status direto na resposta, em vez de lançar exceção: o corpo é o contrato do health, não um erro genérico.
   */
  @ApiDoc({
    summary: 'Saúde da API e do banco.',
    description:
      'Responde 200 quando tudo está de pé e 503, com o MESMO corpo, quando alguma dependência falha.',
    response: healthResponseSchema,
  })
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
