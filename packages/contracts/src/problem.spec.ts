import { describe, expect, it } from 'vitest';
import { problemDetailsSchema } from './problem.js';

describe('problemDetailsSchema', () => {
  it('aceita o erro de domínio da API', () => {
    const result = problemDetailsSchema.safeParse({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: 'identity.invalid_credentials',
      detail: 'E-mail ou senha incorretos.',
      requestId: 'abc',
    });
    expect(result.success).toBe(true);
  });

  it('aceita a lista de problemas de uma entrada malformada', () => {
    const result = problemDetailsSchema.safeParse({
      title: 'Bad Request',
      status: 400,
      code: 'http.400',
      detail: 'A requisição é inválida.',
      errors: [{ path: 'password', message: 'Required' }],
    });
    expect(result.success).toBe(true);
  });

  it('recusa o que não é um erro da API', () => {
    expect(problemDetailsSchema.safeParse({ message: 'oops' }).success).toBe(
      false,
    );
    expect(problemDetailsSchema.safeParse(null).success).toBe(false);
  });
});
