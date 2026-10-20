import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ENV } from './platform/config/config.module.js';
import type { Env } from './platform/config/env.js';

const app = await NestFactory.create(AppModule);

// Faz o Nest chamar onModuleDestroy (ex.: fechar o pool do banco) ao receber SIGTERM/SIGINT.
app.enableShutdownHooks();

const env = app.get<Env>(ENV);
await app.listen(env.PORT);
