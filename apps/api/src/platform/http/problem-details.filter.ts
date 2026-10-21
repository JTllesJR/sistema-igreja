import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../../shared/domain/domain-error.js';
import { statusForDomainError } from './domain-error-status.js';
import {
  type RequestIssue,
  RequestValidationError,
} from './request-validation.error.js';

/** Corpo de erro no formato da RFC 9457 (`application/problem+json`), mais `code` e `requestId` (ADR 0011). */
interface Problem {
  type: 'about:blank';
  title: string;
  status: number;
  code: string;
  detail: string;
  requestId?: string;
  errors?: readonly RequestIssue[];
}

/** Mensagens em português por status; o texto em inglês do framework nunca chega ao usuário. */
const DETAIL_BY_STATUS: Readonly<Record<number, string>> = {
  400: 'A requisição é inválida.',
  401: 'Autenticação necessária ou inválida.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Recurso não encontrado.',
  405: 'Método não permitido para este recurso.',
  413: 'O corpo da requisição é grande demais.',
  415: 'Tipo de conteúdo não suportado.',
  429: 'Muitas requisições. Aguarde um pouco e tente novamente.',
  500: 'Erro interno. Tente novamente mais tarde.',
  503: 'Serviço indisponível no momento.',
};
const GENERIC_DETAIL = 'Não foi possível processar a requisição.';

/**
 * Único ponto onde uma exceção vira resposta HTTP. Toda falha da API sai no mesmo formato, e nada interno (mensagem de
 * erro do banco, pilha, texto de framework) vaza: erro inesperado vira 500 genérico e o detalhe vai só para o log.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const header = response.getHeader('X-Request-Id');
    const requestId = typeof header === 'string' ? header : undefined;

    const problem = this.toProblem(exception, requestId);

    response
      .status(problem.status)
      .type('application/problem+json')
      .json(problem);
  }

  private toProblem(
    exception: unknown,
    requestId: string | undefined,
  ): Problem {
    const base = requestId === undefined ? {} : { requestId };

    if (exception instanceof RequestValidationError) {
      return {
        ...problemFor(400, 'request.invalid', detailFor(400)),
        ...base,
        errors: exception.issues,
      };
    }

    if (exception instanceof DomainError) {
      const status = statusForDomainError(exception.code);
      // 5xx de domínio (estado corrompido, código sem tradução) é problema nosso, não do usuário: esconde e registra.
      if (status < 500) {
        return {
          ...problemFor(status, exception.code, exception.message),
          ...base,
        };
      }
    } else {
      const status = httpStatusOf(exception);
      if (status !== undefined && status >= 400 && status < 500) {
        return {
          ...problemFor(status, `http.${status}`, detailFor(status)),
          ...base,
        };
      }
    }

    this.logger.error(
      `[${requestId ?? 'sem-id'}] ${describe(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    return { ...problemFor(500, 'internal_error', detailFor(500)), ...base };
  }
}

function problemFor(status: number, code: string, detail: string): Problem {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    code,
    detail,
  };
}

function detailFor(status: number): string {
  return DETAIL_BY_STATUS[status] ?? GENERIC_DETAIL;
}

/**
 * Status de uma exceção HTTP do Nest ou de um erro do Express/body-parser (que traz `status`). Quem chama só aceita
 * 4xx: qualquer outra coisa, inclusive um erro qualquer com `status` 5xx, cai no 500 genérico.
 */
function httpStatusOf(exception: unknown): number | undefined {
  if (exception instanceof HttpException) return exception.getStatus();

  if (typeof exception === 'object' && exception !== null) {
    const status = (exception as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

function describe(exception: unknown): string {
  return exception instanceof Error
    ? `${exception.name}: ${exception.message}`
    : `Valor lançado que não é um Error: ${String(exception)}`;
}
