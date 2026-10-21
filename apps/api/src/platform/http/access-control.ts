import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { RequestContext } from '../../shared/application/request-context.js';

/**
 * Marcadores de acesso das rotas (ADR 0011, seção 4). Vivem na plataforma para qualquer módulo poder usá-los sem
 * depender do `identity-access`; quem os interpreta é o guard global, que fica no `identity-access`.
 *
 * O guard NEGA POR PADRÃO: esquecer de marcar uma rota a fecha, não a abre.
 */
export const IS_PUBLIC_KEY = 'access:public';
export const REQUIRED_PERMISSION_KEY = 'access:permission';

/** Rota aberta, sem login (ex.: `/health`, `/auth/login`). Use com muito critério. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Exige que o usuário tenha esta permissão (`modulo:acao`) em ALGUM escopo. A checagem por congregação é do caso de uso. */
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

/** Onde o guard guarda quem está autenticado, dentro do objeto da requisição. */
export const AUTH_KEY = 'auth';

export interface RequestWithAuth {
  [AUTH_KEY]?: { context: RequestContext };
}

/**
 * Entrega ao controller o `RequestContext` (igreja e usuário) montado pelo guard a partir do TOKEN. O id da igreja
 * nunca vem do corpo nem da URL (ADR 0003). Em rota pública não há contexto: pedir um aqui é erro de programação.
 */
export const CurrentContext = createParamDecorator(
  (_data: unknown, host: ExecutionContext): RequestContext => {
    const request = host.switchToHttp().getRequest<RequestWithAuth>();
    const auth = request[AUTH_KEY];
    if (!auth) {
      throw new Error(
        'CurrentContext usado em rota sem autenticação (rota pública ou guard ausente).',
      );
    }
    return auth.context;
  },
);
