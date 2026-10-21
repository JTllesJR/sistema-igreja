import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  CreateAdministratorUseCase,
  createAdministratorCommand,
  type PasswordReader,
} from './modules/identity-access/index.js';
import {
  CreateOrganizationUseCase,
  createOrganizationCommand,
} from './modules/organization/index.js';
import {
  readAllText,
  readHiddenLine,
} from './shared/infrastructure/terminal-input.js';
import type { CliIo } from './shared/presentation/cli-io.js';

// Ponto de entrada das ferramentas do OPERADOR (linha de comando). Não sobe servidor HTTP:
// usa o mesmo módulo Nest da API, só que como "contexto de aplicação", para reaproveitar os casos de uso.
//
//   pnpm cli create-organization --name "Igreja Central"
//   pnpm cli create-administrator --organization <id> --email admin@igreja.com

const io: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

// O prompt vai para o stderr, para o stdout continuar limpo (só o resultado do comando).
const passwords: PasswordReader = {
  isInteractive: Boolean(process.stdin.isTTY),
  readFromStdin: () => readAllText(process.stdin),
  promptHidden: (label) => readHiddenLine(process.stdin, process.stderr, label),
};

const commands: Record<
  string,
  (app: INestApplicationContext, args: string[]) => Promise<number>
> = {
  'create-organization': (app, args) =>
    createOrganizationCommand(
      args,
      app.get(CreateOrganizationUseCase, { strict: false }),
      io,
    ),
  'create-administrator': (app, args) =>
    createAdministratorCommand(
      args,
      app.get(CreateAdministratorUseCase, { strict: false }),
      io,
      passwords,
    ),
};

const [name, ...args] = process.argv.slice(2);
const run = name === undefined ? undefined : commands[name];

if (!run) {
  console.error(
    `Comando desconhecido. Comandos disponíveis: ${Object.keys(commands).join(', ')}`,
  );
  console.error('Para a ajuda de um comando: pnpm cli <comando> --help');
  process.exitCode = 2;
} else {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    process.exitCode = await run(app, args);
  } finally {
    await app.close();
  }
}
