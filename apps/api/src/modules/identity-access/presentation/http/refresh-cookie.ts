import type { Request, Response } from 'express';

/**
 * Cookie do token de renovação (ADR 0011, seção 5): `HttpOnly` (script injetado não lê), `SameSite=Strict` (o navegador
 * só o envia a partir do nosso próprio site) e `Path=/auth` (só vai às rotas de login, renovação e saída).
 * É o ÚNICO lugar do código que toca em cookie.
 */
export const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/auth';

// O token tem 43 caracteres (256 bits em base64url); o teto só barra lixo gigante.
const MAX_COOKIE_VALUE_LENGTH = 512;

/** Lê o token de renovação do cabeçalho `Cookie`. Devolve `null` se ausente ou malformado. */
export function readRefreshToken(request: Request): string | null {
  const header = request.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== REFRESH_COOKIE_NAME) continue;

    const value = part.slice(separator + 1).trim();
    return value !== '' && value.length <= MAX_COOKIE_VALUE_LENGTH
      ? value
      : null;
  }
  return null;
}

/**
 * `secure` exige HTTPS. Fica ligado em qualquer ambiente, menos em desenvolvimento local: o Safari não grava cookie
 * `Secure` em `http://localhost`. Em produção, sem HTTPS o navegador simplesmente não guardaria o cookie.
 */
const baseOptions = (secure: boolean) =>
  ({
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  }) as const;

export function setRefreshCookie(
  response: Response,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(secure),
    expires: expiresAt,
  });
}

/** Os atributos têm de ser os mesmos da gravação, senão o navegador trata como outro cookie e não apaga. */
export function clearRefreshCookie(response: Response, secure: boolean): void {
  response.clearCookie(REFRESH_COOKIE_NAME, baseOptions(secure));
}
