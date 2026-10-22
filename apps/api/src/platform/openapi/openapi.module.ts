import { Module } from '@nestjs/common';
import { OpenApiController } from './openapi.controller.js';

/** Documentação da API (OpenAPI + Swagger UI), ADR 0016. Liga/desliga por `OPENAPI_ENABLED`. */
@Module({ controllers: [OpenApiController] })
export class OpenApiModule {}
