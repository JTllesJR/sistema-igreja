import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuthenticateUseCase } from '../src/modules/identity-access/application/authenticate.use-case.js';
import {
  CreateAdministratorUseCase,
  createAdministratorCommand,
  type PasswordReader,
} from '../src/modules/identity-access/index.js';
import { CreateOrganizationUseCase } from '../src/modules/organization/index.js';
import { PrismaService } from '../src/platform/database/prisma.service.js';
import { uuidFor } from '../src/shared/testing/uuid-for.js';
import { cleanDatabase } from './support/clean-database.js';

const PASSWORD = 'senha-do-operador-123';

let moduleRef: TestingModule;
const use = <T>(token: new (...args: never[]) => T): T =>
  moduleRef.get(token, { strict: false });

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  await moduleRef.init();
});

beforeEach(async () => {
  await cleanDatabase(moduleRef.get(PrismaService));
});

afterAll(async () => {
  await cleanDatabase(moduleRef.get(PrismaService));
  await moduleRef.close();
});

/** Roda o comando com o módulo real e uma senha vinda da "entrada padrão" simulada. */
async function run(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const passwords: PasswordReader = {
    isInteractive: false,
    readFromStdin: () => Promise.resolve(PASSWORD),
    promptHidden: () => Promise.reject(new Error('não deveria pedir prompt')),
  };
  const exitCode = await createAdministratorCommand(
    args,
    use(CreateAdministratorUseCase),
    { out: (line) => out.push(line), err: (line) => err.push(line) },
    passwords,
  );
  return { exitCode, out, err, shown: () => JSON.stringify([out, err]) };
}

async function aChurch() {
  return use(CreateOrganizationUseCase).execute({
    name: 'Igreja Central',
    headquarters: { name: 'Sede' },
  });
}

describe('comando create-administrator (módulo real + argon2 + PostgreSQL)', () => {
  it('cria o administrador, que consegue entrar com a senha enviada', async () => {
    const church = await aChurch();

    const { exitCode, shown } = await run([
      '--organization',
      church.organizationId,
      '--email',
      'Admin@Igreja.com',
      '--password-stdin',
    ]);

    expect(exitCode).toBe(0);
    expect(shown()).not.toContain(PASSWORD);
    const login = await use(AuthenticateUseCase).execute({
      email: 'admin@igreja.com',
      password: PASSWORD,
    });
    expect(login.user.roles.map((r) => r.roleName)).toEqual(['Administrador']);
    expect(login.user.organizationId).toBe(church.organizationId);
  });

  it('no banco fica só o hash argon2id, nunca a senha', async () => {
    const church = await aChurch();

    await run([
      '--organization',
      church.organizationId,
      '--email',
      'admin@igreja.com',
      '--password-stdin',
    ]);

    const user = await moduleRef.get(PrismaService).userAccount.findFirst();
    expect(user?.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(user?.passwordHash).not.toContain(PASSWORD);
  });

  it('e-mail já cadastrado: sai com código 1 e não cria um segundo usuário', async () => {
    const church = await aChurch();
    const args = [
      '--organization',
      church.organizationId,
      '--email',
      'admin@igreja.com',
      '--password-stdin',
    ];
    await run(args);

    const { exitCode, err } = await run(args);

    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Já existe um usuário com este e-mail.');
    expect(await moduleRef.get(PrismaService).userAccount.count()).toBe(1);
  });

  it('igreja inexistente: sai com código 1 e não grava nada', async () => {
    const { exitCode, err } = await run([
      '--organization',
      uuidFor(404),
      '--email',
      'admin@igreja.com',
      '--password-stdin',
    ]);

    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('Igreja não encontrada.');
    expect(await moduleRef.get(PrismaService).userAccount.count()).toBe(0);
    expect(await moduleRef.get(PrismaService).role.count()).toBe(0);
  });
});
