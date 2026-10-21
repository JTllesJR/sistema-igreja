import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Letras, dígitos, ponto, hífen e sublinhado, de 8 a 64: não deixa quebra de linha nem marcação entrar nos logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Dá a cada requisição um identificador (cabeçalho `X-Request-Id`, repetido nos erros e nos logs) para rastrear um
 * problema relatado por um usuário. Aproveita o enviado pelo cliente/proxy só se tiver formato seguro.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();

  res.setHeader('X-Request-Id', id);
  next();
}
