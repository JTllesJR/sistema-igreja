import { describe, expect, it, vi } from 'vitest';
import { ValidationError } from '../../../../shared/domain/domain-error.js';
import { uuidFor } from '../../application/testing/test-bed.js';
import { CongregationId, OrganizationId } from '../../domain/ids.js';
import { createOrganizationCommand } from './create-organization.command.js';

const created = {
  organizationId: OrganizationId.of(uuidFor(1)),
  headquartersId: CongregationId.of(uuidFor(2)),
};

function setup(
  execute: (...args: never[]) => Promise<typeof created> = () =>
    Promise.resolve(created),
) {
  const run = vi.fn(execute);
  const out: string[] = [];
  const err: string[] = [];
  const io = {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
  };
  return {
    run,
    out,
    err,
    call: (args: string[]) =>
      createOrganizationCommand(args, { execute: run }, io),
  };
}

describe('createOrganizationCommand (UC-17)', () => {
  it('cria a organização e imprime os identificadores', async () => {
    const { call, run, out, err } = setup();

    const exitCode = await call([
      '--name',
      'Igreja Central',
      '--headquarters',
      'Matriz',
    ]);

    expect(exitCode).toBe(0);
    expect(run).toHaveBeenCalledWith({
      name: 'Igreja Central',
      headquarters: { name: 'Matriz' },
    });
    expect(out.join('\n')).toContain(created.organizationId);
    expect(out.join('\n')).toContain(created.headquartersId);
    expect(err).toEqual([]);
  });

  it('usa "Sede" como nome da sede quando --headquarters não é informado', async () => {
    const { call, run } = setup();

    await call(['--name', 'Igreja Central']);

    expect(run).toHaveBeenCalledWith({
      name: 'Igreja Central',
      headquarters: { name: 'Sede' },
    });
  });

  it('sem --name: mostra o modo de uso, não chama o caso de uso e sai com código 2', async () => {
    const { call, run, err } = setup();

    const exitCode = await call([]);

    expect(exitCode).toBe(2);
    expect(run).not.toHaveBeenCalled();
    expect(err.join('\n')).toContain('--name');
    expect(err.join('\n')).toContain('Uso:');
  });

  it('com opção desconhecida: sai com código 2 sem chamar o caso de uso', async () => {
    const { call, run, err } = setup();

    const exitCode = await call(['--name', 'Igreja', '--cor', 'azul']);

    expect(exitCode).toBe(2);
    expect(run).not.toHaveBeenCalled();
    expect(err.join('\n')).toContain('Uso:');
  });

  it('--help mostra o modo de uso na saída normal e sai com código 0', async () => {
    const { call, run, out } = setup();

    const exitCode = await call(['--help']);

    expect(exitCode).toBe(0);
    expect(run).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('Uso:');
  });

  it('erro de validação do domínio: mostra a mensagem e sai com código 1', async () => {
    const { call, out, err } = setup(() =>
      Promise.reject(
        new ValidationError('name', 'O nome da igreja é curto demais.'),
      ),
    );

    const exitCode = await call(['--name', 'A']);

    expect(exitCode).toBe(1);
    expect(err.join('\n')).toContain('O nome da igreja é curto demais.');
    expect(out).toEqual([]);
  });

  it('erro inesperado não é escondido: propaga', async () => {
    const { call } = setup(() => Promise.reject(new Error('banco fora do ar')));

    await expect(call(['--name', 'Igreja'])).rejects.toThrow(
      'banco fora do ar',
    );
  });
});
