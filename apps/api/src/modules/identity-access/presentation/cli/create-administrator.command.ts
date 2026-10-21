import { parseArgs } from 'node:util';
import { DomainError } from '../../../../shared/domain/domain-error.js';
import { PromptCancelledError } from '../../../../shared/infrastructure/terminal-input.js';
import type { CliIo } from '../../../../shared/presentation/cli-io.js';
import type { CreateAdministratorUseCase } from '../../application/create-administrator.use-case.js';

/** De onde vem a senha. Separado do terminal real para o comando ser testável. */
export interface PasswordReader {
  /** A entrada é um terminal interativo (dá para pedir a senha sem eco)? */
  readonly isInteractive: boolean;
  /** Lê a senha enviada pela entrada padrão (`--password-stdin`). */
  readFromStdin(): Promise<string>;
  /** Pede uma linha sem eco. Lança `PromptCancelledError` se o usuário cancelar. */
  promptHidden(label: string): Promise<string>;
}

const EXIT_OK = 0;
const EXIT_DOMAIN_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_CANCELLED = 130; // convenção do shell para Ctrl+C

const USAGE = [
  'Uso: pnpm cli create-administrator --organization <id da igreja> --email <e-mail> [--password-stdin]',
  '',
  'Cria um administrador (papel "Administrador", acesso total) para uma igreja que já existe.',
  'O id da igreja é o "organizationId" impresso por `pnpm cli create-organization`.',
  '',
  'A senha NUNCA é passada como argumento (ficaria no histórico do shell e na lista de processos). Há duas formas:',
  '  (padrão)           pede a senha duas vezes, sem eco, num terminal interativo',
  '  --password-stdin   lê a senha da entrada padrão (automação). Ex.: printf \'%s\' "$SENHA" | pnpm cli create-administrator ... --password-stdin',
  '',
  'Códigos de saída: 0 sucesso, 1 dados recusados pelas regras do sistema, 2 uso incorreto, 130 cancelado.',
].join('\n');

const PASSWORD_AS_ARGUMENT_MESSAGE =
  'Por segurança, a senha não pode ser passada como argumento: ela ficaria no histórico do shell e na lista de processos. ' +
  'Use --password-stdin ou deixe o comando pedir a senha.';

/**
 * Comando do operador para criar um administrador da igreja (parte do UC-03; o primeiro administrador nasce por aqui).
 *
 * A senha nunca aparece em argumentos, na tela nem nas mensagens de erro: vem da entrada padrão ou de um prompt sem eco.
 * Devolve o código de saída em vez de chamar `process.exit`, o que o torna testável.
 */
export async function createAdministratorCommand(
  args: string[],
  useCase: Pick<CreateAdministratorUseCase, 'execute'>,
  io: CliIo,
  passwords: PasswordReader,
): Promise<number> {
  // Antes de qualquer outra coisa: nunca aceitar (nem repetir) uma senha que veio como argumento.
  if (
    args.some((arg) => arg === '--password' || arg.startsWith('--password='))
  ) {
    io.err(PASSWORD_AS_ARGUMENT_MESSAGE);
    return EXIT_USAGE;
  }

  let values: {
    organization?: string;
    email?: string;
    'password-stdin'?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        organization: { type: 'string' },
        email: { type: 'string' },
        'password-stdin': { type: 'boolean' },
        help: { type: 'boolean' },
      },
      strict: true,
    }));
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    io.err(USAGE);
    return EXIT_USAGE;
  }

  if (values.help) {
    io.out(USAGE);
    return EXIT_OK;
  }

  for (const required of ['organization', 'email'] as const) {
    if (!values[required]) {
      io.err(`A opção --${required} é obrigatória.`);
      io.err(USAGE);
      return EXIT_USAGE;
    }
  }

  const password = await obtainPassword(
    values['password-stdin'] === true,
    passwords,
    io,
  );
  if (typeof password === 'number') return password;

  try {
    const result = await useCase.execute({
      organizationId: values.organization ?? '',
      email: values.email ?? '',
      password,
    });

    io.out('Administrador criado.');
    io.out(`  userId: ${result.userId}`);
    io.out(`  roleId: ${result.roleId}`);
    return EXIT_OK;
  } catch (error) {
    // Regra de negócio violada (senha fraca, e-mail repetido, igreja inexistente...): mensagem clara, sem a senha.
    if (error instanceof DomainError) {
      io.err(`Erro: ${error.message}`);
      return EXIT_DOMAIN_ERROR;
    }
    throw error;
  }
}

/** Devolve a senha, ou um código de saída se não foi possível obtê-la. */
async function obtainPassword(
  fromStdin: boolean,
  passwords: PasswordReader,
  io: CliIo,
): Promise<string | number> {
  try {
    if (fromStdin) return requireNonEmpty(await passwords.readFromStdin(), io);

    if (!passwords.isInteractive) {
      io.err(
        'Não há um terminal interativo para pedir a senha. Use --password-stdin para enviá-la pela entrada padrão.',
      );
      return EXIT_USAGE;
    }

    const first = await passwords.promptHidden('Senha: ');
    const second = await passwords.promptHidden('Confirme a senha: ');
    if (first !== second) {
      io.err('As senhas não conferem.');
      return EXIT_USAGE;
    }
    return requireNonEmpty(first, io);
  } catch (error) {
    if (error instanceof PromptCancelledError) {
      io.err('Operação cancelada.');
      return EXIT_CANCELLED;
    }
    if (error instanceof Error) {
      io.err(error.message);
      return EXIT_USAGE;
    }
    throw error;
  }
}

function requireNonEmpty(password: string, io: CliIo): string | number {
  if (password === '') {
    io.err('A senha não foi informada.');
    return EXIT_USAGE;
  }
  return password;
}
