import { Global, Module } from '@nestjs/common';
import { parseEnv } from './env.js';

/** Token de injeção da configuração validada: `@Inject(ENV) env: Env`. */
export const ENV = Symbol('ENV');

/**
 * Único módulo global do projeto: configuração é, de fato, necessária em todo lugar.
 * Qualquer outro módulo deve ser importado explicitamente por quem o usa.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
