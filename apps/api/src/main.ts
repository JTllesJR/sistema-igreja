import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { ENV } from './platform/config/config.module.js';
import type { Env } from './platform/config/env.js';
import { configureHttpApp } from './platform/http/configure-http-app.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);

// Faz o Nest chamar onModuleDestroy (ex.: fechar o pool do banco) ao receber SIGTERM/SIGINT.
app.enableShutdownHooks();

const env = app.get<Env>(ENV);
configureHttpApp(app, env);
await app.listen(env.PORT);
