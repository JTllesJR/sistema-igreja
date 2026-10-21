import { parseArgs } from 'node:util';
import { DomainError } from '../../../../shared/domain/domain-error.js';
import type { CliIo } from '../../../../shared/presentation/cli-io.js';
import type { CreateOrganizationUseCase } from '../../application/create-organization.use-case.js';

const DEFAULT_HEADQUARTERS_NAME = 'Sede';

const USAGE = [
  'Uso: pnpm cli create-organization --name "<nome da igreja>" [--headquarters "<nome da sede>"]',
  '',
  'Cria uma igreja já com sua sede (UC-17). Não há endpoint público para isto (ADR 0009).',
  '',
  '  --name            Nome da igreja (obrigatório)',
  `  --headquarters    Nome da sede (padrão: "${DEFAULT_HEADQUARTERS_NAME}")`,
  '  --help            Mostra esta ajuda',
  '',
  'Códigos de saída: 0 sucesso, 1 dados recusados pelas regras do sistema, 2 uso incorreto.',
].join('\n');

/**
 * UC-17: comando do operador para criar a organização inicial.
 *
 * Adaptador de entrada (camada de apresentação, como um controller HTTP): lê argumentos, chama o caso de uso e
 * formata a saída. Devolve o código de saída em vez de chamar `process.exit`, o que o torna testável.
 */
export async function createOrganizationCommand(
  args: string[],
  useCase: Pick<CreateOrganizationUseCase, 'execute'>,
  io: CliIo,
): Promise<number> {
  let values: { name?: string; headquarters?: string; help?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        name: { type: 'string' },
        headquarters: { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
    }));
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    io.err(USAGE);
    return 2;
  }

  if (values.help) {
    io.out(USAGE);
    return 0;
  }

  if (!values.name) {
    io.err('A opção --name é obrigatória.');
    io.err(USAGE);
    return 2;
  }

  try {
    const result = await useCase.execute({
      name: values.name,
      headquarters: { name: values.headquarters ?? DEFAULT_HEADQUARTERS_NAME },
    });

    io.out('Igreja criada.');
    io.out(`  organizationId: ${result.organizationId}`);
    io.out(`  headquartersId: ${result.headquartersId}`);
    return 0;
  } catch (error) {
    // Regra de negócio violada (ex.: nome curto demais): mensagem clara. Qualquer outra falha é inesperada e sobe.
    if (error instanceof DomainError) {
      io.err(`Erro: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
