import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import type { AccessPolicy } from '../../domain/access-policy.js';
import type { SessionId } from '../../domain/ids.js';

/** O que o guard descobre sobre quem chama e deixa na requisição para os controllers. */
export interface AuthState {
  context: RequestContext;
  /** Sessão (dispositivo) do token de acesso; a troca de senha a preserva e revoga as outras. */
  sessionId: SessionId;
  /** O que o usuário pode fazer AGORA (lido do banco a cada requisição, então mudança de papel vale na hora). */
  policy: AccessPolicy;
}

export type AuthenticatedRequest = Request & { auth?: AuthState };

function authOf(host: ExecutionContext): AuthState {
  const auth = host.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) {
    throw new Error(
      'Decorator de autenticação usado em rota pública ou sem o guard global.',
    );
  }
  return auth;
}

/** A política de acesso do usuário, para o controller filtrar por escopo de congregação (ADR 0004). */
export const CurrentPolicy = createParamDecorator(
  (_data: unknown, host: ExecutionContext): AccessPolicy => authOf(host).policy,
);

export const CurrentSessionId = createParamDecorator(
  (_data: unknown, host: ExecutionContext): SessionId => authOf(host).sessionId,
);
