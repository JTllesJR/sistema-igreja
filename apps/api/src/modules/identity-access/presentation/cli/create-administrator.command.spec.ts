import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { PromptCancelledError } from '../../../../shared/infrastructure/terminal-input.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import {
  EmailAlreadyRegisteredError,
  UnknownOrganizationError,
} from '../../domain/errors.js';
import { RoleId, UserId } from '../../domain/ids.js';
import { createAdministratorCommand } from './create-administrator.command.js';

const ORGANIZATION = uuidFor(1);
const PASSWORD = 'senha-super-segura-1';
const created = {
  userId: UserId.of(uuidFor(10)),
  roleId: RoleId.of(uuidFor(11)),
};
const baseArgs = [
  '--organization',
  ORGANIZATION,
  '--email',
  'admin@igreja.com',
];

function setup(
  options: {
    interactive?: boolean;
    stdin?: () => Promise<string>;
    prompts?: string[];
    execute?: (...args: never[]) => Promise<typeof created>;
  } = {},
) {
  const execute = vi.fn(options.execute ?? (() => Promise.resolve(created)));
  const prompts = [...(options.prompts ?? [PASSWORD, PASSWORD])];
  const reader = {
    isInteractive: options.interactive ?? true,
    readFromStdin: vi.fn(options.stdin ?? (() => Promise.resolve(PASSWORD))),
    promptHidden: vi.fn((_label: string) =>
      Promise.resolve(prompts.shift() ?? ''),
    ),
  };
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  };

  return {
    execute,
    reader,
    out,
    err,
    call: (args: string[]) =>
      createAdministratorCommand(args, { execute }, io, reader),
    /** Nada que o comando mostrou pode conter a senha. */
    everythingShown: () => JSON.stringify([out, err]),
  };
}

describe('createAdministratorCommand (UC-03, parte do operador)', () => {
  describe('com --password-stdin (automação)', () => {
    it('lê a senha da entrada padrão, cria o administrador e mostra os identificadores', async () => {
      const { call, execute, reader, out, err, everythingShown } = setup({
        interactive: false,
      });

      const exitCode = await call([...baseArgs, '--password-stdin']);

      expect(exitCode).toBe(0);
      expect(execute).toHaveBeenCalledWith({
        organizationId: ORGANIZATION,
        email: 'admin@igreja.com',
        password: PASSWORD,
      });
      expect(reader.promptHidden).not.toHaveBeenCalled();
      expect(out.join('\n')).toContain(created.userId);
      expect(out.join('\n')).toContain(created.roleId);
      expect(err).toEqual([]);
      expect(everythingShown()).not.toContain(PASSWORD);
    });

    it('tem prioridade sobre o prompt, mesmo num terminal interativo', async () => {
      const { call, reader } = setup({ interactive: true });

      await call([...baseArgs, '--password-stdin']);

      expect(reader.readFromStdin).toHaveBeenCalledOnce();
      expect(reader.promptHidden).not.toHaveBeenCalled();
    });

    it('senha vazia: sai com código 2 sem chamar o caso de uso', async () => {
      const { call, execute, err } = setup({
        stdin: () => Promise.resolve(''),
      });

      const exitCode = await call([...baseArgs, '--password-stdin']);

      expect(exitCode).toBe(2);
      expect(execute).not.toHaveBeenCalled();
      expect(err.join('\n')).toMatch(/senha/i);
    });

    it('entrada grande demais: mostra o motivo e sai com código 2', async () => {
      const { call, execute, err } = setup({
        stdin: () => Promise.reject(new Error('Entrada grande demais.')),
      });

      const exitCode = await call([...baseArgs, '--password-stdin']);

      expect(exitCode).toBe(2);
      expect(execute).not.toHaveBeenCalled();
      expect(err.join('\n')).toContain('Entrada grande demais.');
    });
  });

  describe('com prompt oculto (uso humano)', () => {
    it('pergunta a senha duas vezes e, se conferirem, cria o administrador', async () => {
      const { call, execute, reader, everythingShown } = setup();

      const exitCode = await call(baseArgs);

      expect(exitCode).toBe(0);
      expect(reader.promptHidden).toHaveBeenCalledTimes(2);
      expect(reader.promptHidden.mock.calls[0]?.[0]).toMatch(/senha/i);
      expect(reader.promptHidden.mock.calls[1]?.[0]).toMatch(/confirme/i);
      expect(reader.readFromStdin).not.toHaveBeenCalled();
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ password: PASSWORD }),
      );
      expect(everythingShown()).not.toContain(PASSWORD);
    });

    it('senhas diferentes: sai com código 2, não cria nada e não revela nenhuma das duas', async () => {
      const { call, execute, err, everythingShown } = setup({
        prompts: ['primeira-senha-123', 'segunda-senha-456'],
      });

      const exitCode = await call(baseArgs);

      expect(exitCode).toBe(2);
      expect(execute).not.toHaveBeenCalled();
      expect(err.join('\n')).toMatch(/não conferem/i);
      expect(everythingShown()).not.toContain('primeira-senha-123');
      expect(everythingShown()).not.toContain('segunda-senha-456');
    });

    it('Ctrl+C: sai com código 130 e não cria nada', async () => {
      const { call, execute, reader, err } = setup();
      reader.promptHidden.mockRejectedValueOnce(new PromptCancelledError());

      const exitCode = await call(baseArgs);

      expect(exitCode).toBe(130);
      expect(execute).not.toHaveBeenCalled();
      expect(err.join('\n')).toMatch(/cancelad/i);
    });

    it('sem terminal interativo e sem --password-stdin: explica a saída e não tenta o prompt', async () => {
      const { call, execute, reader, err } = setup({ interactive: false });

      const exitCode = await call(baseArgs);

      expect(exitCode).toBe(2);
      expect(execute).not.toHaveBeenCalled();
      expect(reader.promptHidden).not.toHaveBeenCalled();
      expect(err.join('\n')).toContain('--password-stdin');
    });
  });

  describe('a senha NUNCA vai por argumento', () => {
    it.each([
      [['--password', 'segredo-na-linha-1']],
      [['--password=segredo-na-linha-1']],
    ])('recusa %j, explica o motivo e não repete o valor', async (extra) => {
      const { call, execute, err, out, everythingShown } = setup();

      const exitCode = await call([...baseArgs, ...extra]);

      expect(exitCode).toBe(2);
      expect(execute).not.toHaveBeenCalled();
      // A mensagem DEDICADA (e não só o texto genérico de uso): explica o porquê e aponta as alternativas.
      expect(err.join('\n')).toContain(
        'a senha não pode ser passada como argumento',
      );
      expect(err.join('\n')).toContain('histórico do shell');
      expect(err.join('\n')).toContain('--password-stdin');
      expect(everythingShown()).not.toContain('segredo-na-linha-1');
      expect(out).toEqual([]);
    });
  });

  describe('uso incorreto', () => {
    it.each([
      ['--organization', ['--email', 'admin@igreja.com']],
      ['--email', ['--organization', ORGANIZATION]],
    ])(
      'sem %s: mostra o modo de uso e sai com código 2',
      async (missing, args) => {
        const { call, execute, err } = setup();

        const exitCode = await call([...args, '--password-stdin']);

        expect(exitCode).toBe(2);
        expect(execute).not.toHaveBeenCalled();
        expect(err.join('\n')).toContain(missing);
        expect(err.join('\n')).toContain('Uso:');
      },
    );

    it('opção desconhecida: sai com código 2 sem ler senha', async () => {
      const { call, execute, reader } = setup();

      const exitCode = await call([...baseArgs, '--cor', 'azul']);

      expect(exitCode).toBe(2);
      expect(execute).not.toHaveBeenCalled();
      expect(reader.promptHidden).not.toHaveBeenCalled();
      expect(reader.readFromStdin).not.toHaveBeenCalled();
    });

    it('--help mostra o uso, avisa sobre a senha e sai com código 0', async () => {
      const { call, execute, reader, out } = setup();

      const exitCode = await call(['--help']);

      expect(exitCode).toBe(0);
      expect(execute).not.toHaveBeenCalled();
      expect(reader.promptHidden).not.toHaveBeenCalled();
      expect(out.join('\n')).toContain('Uso:');
      expect(out.join('\n')).toContain('--password-stdin');
      expect(out.join('\n')).toMatch(/nunca.*argumento/i);
    });
  });

  describe('erros das regras do sistema (código 1)', () => {
    it('senha fora da política: mostra a mensagem sem repetir a senha', async () => {
      const { call, err, everythingShown } = setup({
        stdin: () => Promise.resolve('curta'),
        execute: () =>
          Promise.reject(
            new ValidationError(
              'password',
              'A senha deve ter entre 10 e 128 caracteres.',
            ),
          ),
      });

      const exitCode = await call([...baseArgs, '--password-stdin']);

      expect(exitCode).toBe(1);
      expect(err.join('\n')).toContain(
        'A senha deve ter entre 10 e 128 caracteres.',
      );
      expect(everythingShown()).not.toContain('curta');
    });

    it('e-mail já cadastrado', async () => {
      const { call, err, out } = setup({
        execute: () => Promise.reject(new EmailAlreadyRegisteredError()),
      });

      const exitCode = await call(baseArgs);

      expect(exitCode).toBe(1);
      expect(err.join('\n')).toContain('Já existe um usuário com este e-mail.');
      expect(out).toEqual([]);
    });

    it('igreja inexistente', async () => {
      const { call, err } = setup({
        execute: () => Promise.reject(new UnknownOrganizationError()),
      });

      const exitCode = await call(baseArgs);

      expect(exitCode).toBe(1);
      expect(err.join('\n')).toContain('Igreja não encontrada.');
    });

    it('erro inesperado não é escondido: propaga', async () => {
      const { call } = setup({
        execute: () => Promise.reject(new Error('banco fora do ar')),
      });

      await expect(call(baseArgs)).rejects.toThrow('banco fora do ar');
    });
  });
});
