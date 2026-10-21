import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  CreateOrganizationUseCase,
  createOrganizationCommand,
} from './modules/organization/index.js';

// Ponto de entrada das ferramentas do OPERADOR (linha de comando). Não sobe servidor HTTP:
// usa o mesmo módulo Nest da API, só que como "contexto de aplicação", para reaproveitar os casos de uso.
//
//   pnpm cli create-organization --name "Igreja Central"

const [command, ...args] = process.argv.slice(2);

if (command !== 'create-organization') {
  console.error(
    'Comando desconhecido. Comandos disponíveis: create-organization',
  );
  console.error('Para a ajuda de um comando: pnpm cli <comando> --help');
  process.exitCode = 2;
} else {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    process.exitCode = await createOrganizationCommand(
      args,
      app.get(CreateOrganizationUseCase, { strict: false }),
      { out: (line) => console.log(line), err: (line) => console.error(line) },
    );
  } finally {
    await app.close();
  }
}
