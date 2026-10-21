import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Env } from '../config/env.js';
import { requestIdMiddleware } from './request-id.js';

/** Limite do corpo JSON (ADR 0011). Nenhuma tela do sistema envia nada parecido com isso; arquivos terão rota própria. */
const JSON_BODY_LIMIT = '100kb';

/**
 * Configuração HTTP que não pertence a nenhum módulo: identificador da requisição, cabeçalhos de segurança, CORS e
 * limite do corpo. Usada pelo `main.ts` e pelos testes de integração, para testar exatamente o que roda em produção.
 */
export function configureHttpApp(
  app: NestExpressApplication,
  env: Pick<Env, 'CORS_ORIGINS'>,
): void {
  app.use(requestIdMiddleware);
  app.use(helmet());

  app.enableCors({
    origin: env.CORS_ORIGINS,
    // O cookie de renovação só é enviado pelo navegador se a API aceitar credenciais (ADR 0011, seção 5).
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
  });

  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
}
