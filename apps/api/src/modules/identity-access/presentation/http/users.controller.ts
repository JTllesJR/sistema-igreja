import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  type CreateUserRequest,
  createUserRequestSchema,
  type RoleAssignmentRequest,
  roleAssignmentRequestSchema,
  type TemporaryPasswordResponse,
  type UserSummary,
} from '@igreja/contracts';
import { z } from 'zod';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import { ACCESS_MANAGE_USERS } from '../../access.permissions.js';
import { AssignRoleUseCase } from '../../application/assign-role.use-case.js';
import { CreateUserUseCase } from '../../application/create-user.use-case.js';
import { DisableUserUseCase } from '../../application/disable-user.use-case.js';
import { EnableUserUseCase } from '../../application/enable-user.use-case.js';
import { ListUsersUseCase } from '../../application/list-users.use-case.js';
import { ResetPasswordUseCase } from '../../application/reset-password.use-case.js';
import { RevokeRoleUseCase } from '../../application/revoke-role.use-case.js';

/** Identificador na URL: texto fora do formato é 400, sem chegar ao domínio. */
const idPipe = new ZodValidationPipe(z.uuid());

/** Gerir usuários mexe nas pessoas da igreja inteira: um papel só de uma congregação não basta (ADR 0014). */
const MANAGE = { organizationWide: true };

/**
 * Adaptador HTTP da administração de usuários (UC-02/03, versão enxuta do ADR 0014). A igreja vem do token; o `:id`
 * escolhe QUAL usuário DA igreja de quem pede: usuário de outra igreja responde 404 (ADR 0003). As ações que mudam
 * algo devolvem o usuário atualizado, para a tela atualizar a lista sem outra consulta.
 */
@Controller('users')
export class UsersController {
  constructor(
    @Inject(ListUsersUseCase) private readonly list: ListUsersUseCase,
    @Inject(AssignRoleUseCase) private readonly assign: AssignRoleUseCase,
    @Inject(RevokeRoleUseCase) private readonly revoke: RevokeRoleUseCase,
    @Inject(DisableUserUseCase) private readonly disable: DisableUserUseCase,
    @Inject(EnableUserUseCase) private readonly enable: EnableUserUseCase,
    @Inject(CreateUserUseCase) private readonly create: CreateUserUseCase,
    @Inject(ResetPasswordUseCase) private readonly reset: ResetPasswordUseCase,
  ) {}

  @RequirePermission(ACCESS_MANAGE_USERS, MANAGE)
  @Get()
  findAll(@CurrentContext() context: RequestContext): Promise<UserSummary[]> {
    return this.list.execute(context);
  }

  // `no-store`: a resposta traz a senha temporária, que não pode ficar em cache de navegador nem de proxy.
  @RequirePermission(ACCESS_MANAGE_USERS, MANAGE)
  @Header('Cache-Control', 'no-store')
  @Post()
  createUser(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createUserRequestSchema))
    body: CreateUserRequest,
  ): Promise<TemporaryPasswordResponse> {
    return this.create.execute(context, body);
  }

  @RequirePermission(ACCESS_MANAGE_USERS, MANAGE)
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post(':id/reset-password')
  resetPassword(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
  ): Promise<TemporaryPasswordResponse> {
    return this.reset.execute(context, { userId: id });
  }

  @RequirePermission(ACCESS_MANAGE_USERS, MANAGE)
  @HttpCode(200)
  @Post(':id/assignments')
  assignRole(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(roleAssignmentRequestSchema))
    body: RoleAssignmentRequest,
  ): Promise<UserSummary> {
    return this.assign.execute(context, { userId: id, ...body });
  }

  // POST e não DELETE: a congregação pode ser nula (igreja toda), e uma chave composta com nulo não cabe bem na URL.
  @RequirePermission(ACCESS_MANAGE_USERS, MANAGE)
  @HttpCode(200)
  @Post(':id/assignments/revoke')
  revokeRole(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(roleAssignmentRequestSchema))
    body: RoleAssignmentRequest,
  ): Promise<UserSummary> {
    return this.revoke.execute(context, { userId: id, ...body });
  }

  @RequirePermission(ACCESS_MANAGE_USERS, MANAGE)
  @HttpCode(200)
  @Post(':id/disable')
  disableUser(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
  ): Promise<UserSummary> {
    return this.disable.execute(context, { userId: id });
  }

  @RequirePermission(ACCESS_MANAGE_USERS, MANAGE)
  @HttpCode(200)
  @Post(':id/enable')
  enableUser(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
  ): Promise<UserSummary> {
    return this.enable.execute(context, { userId: id });
  }
}
