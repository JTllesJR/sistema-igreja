import { createRequire } from 'node:module';
import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Res,
  type Type,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import type { Response } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { Public } from '../http/access-control.js';
import { buildOpenApiDocument } from './build-openapi-document.js';

const swaggerUiRoot = (
  createRequire(import.meta.url)('swagger-ui-dist') as {
    getAbsoluteFSPath(): string;
  }
).getAbsoluteFSPath();

/** Só estes arquivos do `swagger-ui-dist` são servidos (lista fechada: nada de caminho escolhido pelo cliente). */
const UI_ASSETS: ReadonlySet<string> = new Set([
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'favicon-32x32.png',
]);

const PAGE = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>API do Sistema de Gestão de Igreja</title>
    <link rel="stylesheet" href="/docs/swagger-ui.css" />
    <link rel="icon" href="/docs/favicon-32x32.png" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui-bundle.js"></script>
    <script src="/docs/docs-init.js"></script>
  </body>
</html>
`;

// Arquivo à parte (e não um <script> embutido na página) porque a política de segurança do helmet só aceita scripts do
// próprio site.
const INIT_SCRIPT = `window.ui = SwaggerUIBundle({
  url: '/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  tryItOutEnabled: false,
});
`;

/**
 * Serve a documentação da API (ADR 0016): `GET /openapi.json` (o documento) e `GET /docs` (Swagger UI). Só responde com
 * `OPENAPI_ENABLED=true`; desligada, é 404, como se as rotas não existissem. As rotas são abertas (sem login) porque o
 * documento descreve a API e não carrega dado nenhum; o que pede login é chamar a API de verdade.
 */
@Public()
@Controller()
export class OpenApiController {
  #document: Record<string, unknown> | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly modules: ModulesContainer,
  ) {}

  @Get('openapi.json')
  document(): Record<string, unknown> {
    this.#assertEnabled();
    this.#document ??= buildOpenApiDocument(this.#controllers(), {
      title: 'API do Sistema de Gestão de Igreja',
      version: '0.0.0',
      description:
        'API REST do sistema. Erros seguem a RFC 9457 (`application/problem+json`) com um `code` estável. ' +
        'Dinheiro é sempre em centavos inteiros. Dados de membros e de quem contribuiu são sensíveis: as leituras são auditadas.',
    });
    return this.#document;
  }

  @Get('docs')
  page(@Res() response: Response): void {
    this.#assertEnabled();
    response.type('html').send(PAGE);
  }

  @Get('docs/:file')
  asset(@Param('file') file: string, @Res() response: Response): void {
    this.#assertEnabled();
    if (file === 'docs-init.js') {
      response.type('js').send(INIT_SCRIPT);
      return;
    }
    if (!UI_ASSETS.has(file)) throw new NotFoundException();
    response.sendFile(file, { root: swaggerUiRoot });
  }

  #assertEnabled(): void {
    if (!this.env.OPENAPI_ENABLED) throw new NotFoundException();
  }

  /** Todo controller de negócio da aplicação, descoberto em execução: controller novo entra na documentação sozinho. */
  #controllers(): Type<unknown>[] {
    return [...this.modules.values()]
      .flatMap((module) => [...module.controllers.values()])
      .map((wrapper) => wrapper.metatype)
      .filter(
        (type): type is Type<unknown> =>
          type !== null &&
          type !== OpenApiController &&
          Reflect.getMetadata(PATH_METADATA, type) !== undefined,
      );
  }
}
