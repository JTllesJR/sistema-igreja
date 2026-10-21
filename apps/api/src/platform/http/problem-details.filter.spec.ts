import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConcurrencyConflictError } from '../../shared/domain/concurrency-conflict.error.js';
import {
  DomainError,
  ValidationError,
} from '../../shared/domain/domain-error.js';
import { ProblemDetailsFilter } from './problem-details.filter.js';
import { RequestValidationError } from './request-validation.error.js';

class UnmappedError extends DomainError {
  constructor() {
    super('modulo.sem_mapeamento', 'Mensagem interna');
  }
}

/** Resposta Express falsa: registra o que o filtro enviou. */
function run(exception: unknown, requestId: string | null = 'req-1234567') {
  const sent: {
    status?: number;
    type?: string;
    body?: Record<string, unknown>;
  } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    type(value: string) {
      sent.type = value;
      return response;
    },
    json(body: Record<string, unknown>) {
      sent.body = body;
      return response;
    },
    getHeader: (name: string) =>
      name === 'X-Request-Id' ? (requestId ?? undefined) : undefined,
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) };

  new ProblemDetailsFilter().catch(exception, host as never);

  return sent;
}

function silenceErrorLog() {
  return vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
}

afterEach(() => vi.restoreAllMocks());

describe('ProblemDetailsFilter (RFC 9457)', () => {
  it('responde com application/problem+json e o identificador da requisição', () => {
    const sent = run(new NotFoundException());

    expect(sent.type).toBe('application/problem+json');
    expect(sent.body?.['requestId']).toBe('req-1234567');
    expect(sent.body?.['type']).toBe('about:blank');
  });

  describe('DomainError', () => {
    it('usa o status da tabela, o code do erro e a mensagem do domínio em detail', () => {
      const sent = run(new ConcurrencyConflictError());

      expect(sent.status).toBe(409);
      expect(sent.body).toMatchObject({
        status: 409,
        title: 'Conflict',
        code: 'concurrency.conflict',
        detail:
          'Os dados foram alterados por outra operação. Recarregue e tente novamente.',
      });
    });

    it('regra de valor recusado vira 422 e mostra a mensagem do domínio', () => {
      const sent = run(new ValidationError('name', 'O nome é obrigatório.'));

      expect(sent.status).toBe(422);
      expect(sent.body).toMatchObject({
        title: 'Unprocessable Entity',
        code: 'validation.invalid_value',
        detail: 'O nome é obrigatório.',
      });
    });

    it('código sem mapeamento: 500 genérico, sem vazar a mensagem, e o problema é registrado', () => {
      const log = silenceErrorLog();

      const sent = run(new UnmappedError());

      expect(sent.status).toBe(500);
      expect(sent.body?.['code']).toBe('internal_error');
      expect(JSON.stringify(sent.body)).not.toContain('Mensagem interna');
      expect(JSON.stringify(sent.body)).not.toContain('sem_mapeamento');
      expect(log).toHaveBeenCalled();
    });

    it('erro de servidor mapeado (estado corrompido) também esconde o detalhe', () => {
      const log = silenceErrorLog();
      class Corrupted extends DomainError {
        constructor() {
          super('organization.state_corrupted', 'Detalhe interno do banco');
        }
      }

      const sent = run(new Corrupted());

      expect(sent.status).toBe(500);
      expect(JSON.stringify(sent.body)).not.toContain('Detalhe interno');
      expect(log).toHaveBeenCalled();
    });
  });

  describe('entrada malformada', () => {
    it('400 com a lista de problemas (caminho e mensagem)', () => {
      const sent = run(
        new RequestValidationError([
          { path: 'email', message: 'E-mail inválido' },
          { path: 'password', message: 'Muito curta' },
        ]),
      );

      expect(sent.status).toBe(400);
      expect(sent.body).toMatchObject({
        title: 'Bad Request',
        code: 'request.invalid',
        errors: [
          { path: 'email', message: 'E-mail inválido' },
          { path: 'password', message: 'Muito curta' },
        ],
      });
    });

    it('outros erros não trazem a chave errors', () => {
      expect(run(new NotFoundException()).body).not.toHaveProperty('errors');
    });
  });

  describe('exceções HTTP do Nest', () => {
    it.each([
      [new UnauthorizedException(), 401, 'Unauthorized'],
      [new ForbiddenException(), 403, 'Forbidden'],
      [new NotFoundException('Cannot GET /x'), 404, 'Not Found'],
      [new HttpException('x', 429), 429, 'Too Many Requests'],
      [new BadRequestException('x'), 400, 'Bad Request'],
    ])('%# -> status %i, título %s', (exception, status, title) => {
      const sent = run(exception);

      expect(sent.status).toBe(status);
      expect(sent.body).toMatchObject({
        status,
        title,
        code: `http.${status}`,
      });
    });

    it('detail é uma mensagem em português por status, não o texto em inglês do framework', () => {
      const sent = run(new NotFoundException('Cannot GET /segredo'));

      expect(sent.body?.['detail']).toBe('Recurso não encontrado.');
    });

    it('status sem texto próprio usa uma mensagem genérica em português', () => {
      const sent = run(new HttpException('x', 418));

      expect(sent.body?.['detail']).toBe(
        'Não foi possível processar a requisição.',
      );
    });
  });

  describe('erros do tratamento de requisição do Express (body-parser)', () => {
    it('corpo grande demais (status 413) vira 413', () => {
      const sent = run(
        Object.assign(new Error('request entity too large'), { status: 413 }),
      );

      expect(sent.status).toBe(413);
      expect(sent.body).toMatchObject({
        code: 'http.413',
        title: 'Payload Too Large',
      });
    });

    it('JSON malformado (SyntaxError com status 400) vira 400, sem repetir o trecho do JSON', () => {
      const sent = run(
        Object.assign(
          new SyntaxError('Unexpected token s in JSON: "senha-xyz"'),
          { status: 400 },
        ),
      );

      expect(sent.status).toBe(400);
      expect(JSON.stringify(sent.body)).not.toContain('senha-xyz');
    });

    it('um erro qualquer com status 5xx NÃO é aceito como está: vira 500 genérico', () => {
      silenceErrorLog();

      const sent = run(Object.assign(new Error('segredo'), { status: 502 }));

      expect(sent.status).toBe(500);
      expect(JSON.stringify(sent.body)).not.toContain('segredo');
    });
  });

  describe('erro inesperado', () => {
    it('500 genérico: nada do erro original aparece na resposta, e o log recebe a pilha', () => {
      const log = silenceErrorLog();
      const original = new Error(
        'connection to postgres://user:pass@db failed',
      );

      const sent = run(original);

      expect(sent.status).toBe(500);
      expect(sent.body).toMatchObject({
        title: 'Internal Server Error',
        code: 'internal_error',
        detail: 'Erro interno. Tente novamente mais tarde.',
      });
      expect(JSON.stringify(sent.body)).not.toContain('postgres');
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('req-1234567'),
        original.stack,
      );
    });

    it('lançamento de algo que não é Error (string, null) também vira 500', () => {
      silenceErrorLog();

      expect(run('texto solto').status).toBe(500);
      expect(run(null).status).toBe(500);
    });
  });

  it.each([
    ['entrada malformada', () => new RequestValidationError([])],
    ['erro de domínio', () => new ConcurrencyConflictError()],
    ['exceção HTTP', () => new NotFoundException()],
    ['erro inesperado', () => new Error('x')],
  ])('%s também leva o identificador da requisição', (_tipo, make) => {
    silenceErrorLog();

    expect(run(make()).body?.['requestId']).toBe('req-1234567');
  });

  it('exceção HTTP com status 1xx-3xx ou 5xx (não é erro de cliente) vira 500 genérico', () => {
    silenceErrorLog();

    expect(run(new HttpException('x', 302)).status).toBe(500);
    expect(run(new HttpException('x', 503)).status).toBe(500);
  });

  it('sem identificador de requisição, o campo é omitido (e não "undefined")', () => {
    const sent = run(new NotFoundException(), null);

    expect(sent.body).not.toHaveProperty('requestId');
  });
});
