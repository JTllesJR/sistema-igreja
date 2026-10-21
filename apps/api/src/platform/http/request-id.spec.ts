import { describe, expect, it, vi } from 'vitest';
import { requestIdMiddleware } from './request-id.js';

function run(incoming?: string) {
  const headers = new Map<string, string>();
  const req = {
    headers: incoming === undefined ? {} : { 'x-request-id': incoming },
  };
  const res = {
    setHeader: (name: string, value: string) => headers.set(name, value),
  };
  const next = vi.fn();

  requestIdMiddleware(req as never, res as never, next);

  return { id: headers.get('X-Request-Id'), next };
}

describe('requestIdMiddleware', () => {
  it('gera um UUID quando a requisição não traz identificador e segue a cadeia', () => {
    const { id, next } = run();

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('gera identificadores diferentes a cada requisição', () => {
    expect(run().id).not.toBe(run().id);
  });

  it('aproveita o identificador enviado quando tem formato seguro', () => {
    expect(run('abc-123_DEF.456').id).toBe('abc-123_DEF.456');
  });

  it.each([
    ['curto demais', 'abc'],
    ['um caractere a menos que o mínimo', 'a'.repeat(7)],
    ['longo demais', 'a'.repeat(65)],
    ['com espaço', 'abc def ghi jkl'],
    ['com quebra de linha (injeção de log/cabeçalho)', 'abcdefgh\nX-Evil: 1'],
    ['com caracteres especiais', '<script>alert(1)</script>'],
  ])('descarta o identificador %s e gera outro', (_motivo, incoming) => {
    const { id } = run(incoming);

    expect(id).not.toBe(incoming);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('aceita exatamente 8 e 64 caracteres', () => {
    expect(run('a'.repeat(8)).id).toBe('a'.repeat(8));
    expect(run('a'.repeat(64)).id).toBe('a'.repeat(64));
  });
});
