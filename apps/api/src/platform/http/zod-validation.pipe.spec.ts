import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { thrownBy } from '../../shared/testing/thrown-by.js';
import { RequestValidationError } from './request-validation.error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  profile: z.object({ age: z.number().int() }).optional(),
});

describe('ZodValidationPipe', () => {
  it('devolve o valor já interpretado pelo schema (apara, converte, remove campos extras)', () => {
    const pipe = new ZodValidationPipe(
      z.object({ name: z.string().trim(), n: z.coerce.number() }),
    );

    expect(pipe.transform({ name: '  Ana ', n: '3', extra: 1 })).toEqual({
      name: 'Ana',
      n: 3,
    });
  });

  it('entrada inválida lança RequestValidationError com caminho e mensagem de cada problema', () => {
    const pipe = new ZodValidationPipe(schema);

    const error = thrownBy(() =>
      pipe.transform({
        email: 'nao-e-email',
        password: 'curta',
        profile: { age: 'x' },
      }),
    );

    expect(error).toBeInstanceOf(RequestValidationError);
    const paths = (error as RequestValidationError).issues.map((i) => i.path);
    expect(paths).toEqual(['email', 'password', 'profile.age']);
    for (const issue of (error as RequestValidationError).issues) {
      expect(issue.message).not.toBe('');
    }
  });

  it('corpo ausente (undefined) também é recusado, não ignorado', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(thrownBy(() => pipe.transform(undefined))).toBeInstanceOf(
      RequestValidationError,
    );
  });

  it('NUNCA repete o valor enviado (uma senha no campo errado não pode voltar na resposta)', () => {
    const pipe = new ZodValidationPipe(schema);
    const secret = 'senha-super-secreta-do-usuario';

    const error = thrownBy(() =>
      pipe.transform({ email: secret, password: secret }),
    );

    expect(
      JSON.stringify((error as RequestValidationError).issues),
    ).not.toContain(secret);
    expect((error as Error).message).not.toContain(secret);
  });
});
