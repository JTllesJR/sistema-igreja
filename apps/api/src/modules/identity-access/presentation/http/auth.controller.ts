import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type AccessTokenResponse,
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type CurrentUser,
  type LoginRequest,
  loginRequestSchema,
  type LoginResponse,
} from '@igreja/contracts';
import type { Request, Response } from 'express';
import { ENV } from '../../../../platform/config/config.module.js';
import type { Env } from '../../../../platform/config/env.js';
import {
  CurrentContext,
  Public,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import { AuthenticateUseCase } from '../../application/authenticate.use-case.js';
import { ChangeOwnPasswordUseCase } from '../../application/change-own-password.use-case.js';
import { GetCurrentUserUseCase } from '../../application/get-current-user.use-case.js';
import { LogoutUseCase } from '../../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../../application/refresh-session.use-case.js';
import {
  SessionInvalidError,
  SessionReuseDetectedError,
} from '../../domain/errors.js';
import type { SessionId } from '../../domain/ids.js';
import { CurrentSessionId } from './authenticated-request.js';
import {
  clearRefreshCookie,
  readRefreshToken,
  setRefreshCookie,
} from './refresh-cookie.js';

const MINUTE_MS = 60_000;
// Limites por IP e por rota, MAIS APERTADOS que o global (ADR 0011, seção 7); somam-se ao bloqueio por conta
// (5 falhas, ADR 0010), que não depende de IP. Quem passa do limite recebe 429.
const LOGIN_LIMIT = { default: { limit: 10, ttl: MINUTE_MS } };
const REFRESH_LIMIT = { default: { limit: 30, ttl: MINUTE_MS } };
const PASSWORD_LIMIT = { default: { limit: 10, ttl: MINUTE_MS } };

/**
 * Adaptador HTTP do login (ADR 0011). Só traduz: valida a entrada, chama o caso de uso e devolve JSON. O token de
 * acesso vai no corpo (o navegador o guarda só em memória); o de renovação vai SOMENTE no cookie `httpOnly`.
 */
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    @Inject(AuthenticateUseCase)
    private readonly authenticate: AuthenticateUseCase,
    @Inject(RefreshSessionUseCase)
    private readonly refreshSession: RefreshSessionUseCase,
    @Inject(LogoutUseCase) private readonly logoutUseCase: LogoutUseCase,
    @Inject(GetCurrentUserUseCase)
    private readonly currentUser: GetCurrentUserUseCase,
    @Inject(ChangeOwnPasswordUseCase)
    private readonly changePassword: ChangeOwnPasswordUseCase,
    @Inject(ENV) env: Env,
  ) {
    this.secureCookie = env.NODE_ENV !== 'development';
  }

  // `no-store`: resposta com token nunca deve ficar em cache de navegador ou proxy.
  @Public()
  @Throttle(LOGIN_LIMIT)
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.authenticate.execute(body);

    setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshTokenExpiresAt,
      this.secureCookie,
    );
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
      user: result.user,
    };
  }

  @Public()
  @Throttle(REFRESH_LIMIT)
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const refreshToken = readRefreshToken(request);
    if (!refreshToken) throw new SessionInvalidError();

    try {
      const tokens = await this.refreshSession.execute({ refreshToken });
      setRefreshCookie(
        response,
        tokens.refreshToken,
        tokens.refreshTokenExpiresAt,
        this.secureCookie,
      );
      return {
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
      };
    } catch (error) {
      // Cookie que não serve mais (expirado, revogado, reusado) só atrapalha: apaga, para o navegador parar de enviá-lo.
      if (
        error instanceof SessionInvalidError ||
        error instanceof SessionReuseDetectedError
      ) {
        clearRefreshCookie(response, this.secureCookie);
      }
      throw error;
    }
  }

  // Pública porque quem sai pode estar com o token de acesso vencido; a prova de quem é está no cookie.
  // Idempotente: sem cookie ou com cookie desconhecido, responde 204 do mesmo jeito.
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const refreshToken = readRefreshToken(request);
    if (refreshToken) await this.logoutUseCase.execute({ refreshToken });
    clearRefreshCookie(response, this.secureCookie);
  }

  @Get('me')
  me(@CurrentContext() context: RequestContext): Promise<CurrentUser> {
    return this.currentUser.execute(context);
  }

  @Throttle(PASSWORD_LIMIT)
  @Post('change-password')
  @HttpCode(204)
  async changeOwnPassword(
    @CurrentContext() context: RequestContext,
    @CurrentSessionId() sessionId: SessionId,
    @Body(new ZodValidationPipe(changePasswordRequestSchema))
    body: ChangePasswordRequest,
  ): Promise<void> {
    await this.changePassword.execute(context, {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      currentSessionId: sessionId,
    });
  }
}
