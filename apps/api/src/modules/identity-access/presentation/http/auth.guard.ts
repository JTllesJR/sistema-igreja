import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ALLOW_PASSWORD_CHANGE_PENDING_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSION_KEY,
  type PermissionRequirement,
} from '../../../../platform/http/access-control.js';
import type { Clock } from '../../../../shared/application/clock.js';
import { DomainError } from '../../../../shared/domain/domain-error.js';
import { ActorId } from '../../../../shared/domain/identifiers.js';
import type { AccessTokenVerifier } from '../../application/access-token-verifier.js';
import { GetAccessPolicyUseCase } from '../../application/get-access-policy.use-case.js';
import type { AccessPolicy } from '../../domain/access-policy.js';
import {
  PasswordChangeRequiredError,
  PermissionDeniedError,
  SessionInvalidError,
} from '../../domain/errors.js';
import { Permission } from '../../domain/permission.js';
import { ACCESS_TOKEN_VERIFIER, CLOCK } from '../../identity-access.tokens.js';
import type { AuthenticatedRequest } from './authenticated-request.js';

// Códigos que, com um token VÁLIDO, significam "esta conta não existe mais ou foi desativada": para quem chama é o
// mesmo que sessão encerrada (401), e não um "usuário não encontrado" (404) que vazaria o motivo.
const ACCOUNT_GONE_CODES = new Set([
  'identity.user_not_found',
  'identity.session_invalid',
]);

/**
 * Guard GLOBAL que nega por padrão (ADR 0011, seção 4): toda rota exige login, a menos que esteja marcada com
 * `@Public()`. Esquecer o decorator fecha a rota em vez de abri-la.
 *
 * Para cada requisição autenticada: confere o JWT, monta o `RequestContext` (a igreja vem do TOKEN, nunca do corpo),
 * carrega a política de acesso atual e, se a rota tem `@RequirePermission`, confere a permissão.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly verifier: AccessTokenVerifier,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GetAccessPolicyUseCase)
    private readonly policies: GetAccessPolicyUseCase,
  ) {}

  async canActivate(host: ExecutionContext): Promise<boolean> {
    if (host.getType() !== 'http') return true;

    const targets = [host.getHandler(), host.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = host.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerTokenOf(request.headers.authorization);
    const claims = token
      ? await this.verifier.verify(token, this.clock.now())
      : null;
    if (!claims) throw new SessionInvalidError();

    const context = {
      organizationId: claims.organizationId,
      actorId: ActorId.of(claims.userId),
    };
    const policy = await this.loadPolicy(context);

    // Senha temporária ainda não trocada: só as rotas marcadas passam. Vem ANTES da permissão, para o cliente receber o
    // motivo certo (trocar a senha) em vez de um "sem permissão" que a troca não resolveria.
    if (
      policy.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_PENDING_KEY,
        targets,
      )
    ) {
      throw new PasswordChangeRequiredError();
    }

    const required = this.reflector.getAllAndOverride<
      PermissionRequirement | undefined
    >(REQUIRED_PERMISSION_KEY, targets);
    if (required && !isSatisfiedBy(policy, required)) {
      throw new PermissionDeniedError();
    }

    request.auth = { context, sessionId: claims.sessionId, policy };
    return true;
  }

  private async loadPolicy(
    context: Parameters<GetAccessPolicyUseCase['execute']>[0],
  ): Promise<AccessPolicy> {
    try {
      return await this.policies.execute(context);
    } catch (error) {
      if (error instanceof DomainError && ACCOUNT_GONE_CODES.has(error.code)) {
        throw new SessionInvalidError();
      }
      throw error;
    }
  }
}

function isSatisfiedBy(
  policy: AccessPolicy,
  { permission, organizationWide }: PermissionRequirement,
): boolean {
  const required = Permission.of(permission);
  return organizationWide
    ? policy.hasOrganizationWide(required)
    : policy.hasPermission(required);
}

/** `Authorization: Bearer <token>`: esquema sem diferenciar caixa, um único espaço, token sem espaços. */
export function bearerTokenOf(header: string | undefined): string | null {
  if (header === undefined) return null;
  const match = /^bearer ([^\s]+)$/i.exec(header);
  return match?.[1] ?? null;
}
