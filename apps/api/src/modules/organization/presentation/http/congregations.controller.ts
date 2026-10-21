import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type Congregation,
  type ListCongregationsQuery,
  listCongregationsQuerySchema,
  type RegisterCongregationRequest,
  registerCongregationRequestSchema,
  type UpdateCongregationRequest,
  updateCongregationRequestSchema,
} from '@igreja/contracts';
import { z } from 'zod';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import { DeactivateCongregationUseCase } from '../../application/deactivate-congregation.use-case.js';
import { DesignateHeadquartersUseCase } from '../../application/designate-headquarters.use-case.js';
import { ListCongregationsUseCase } from '../../application/list-congregations.use-case.js';
import { ReactivateCongregationUseCase } from '../../application/reactivate-congregation.use-case.js';
import { RegisterCongregationUseCase } from '../../application/register-congregation.use-case.js';
import { UpdateCongregationUseCase } from '../../application/update-congregation.use-case.js';
import {
  ORGANIZATION_MANAGE,
  ORGANIZATION_READ,
} from '../../organization.permissions.js';

/** Identificador na URL: texto fora do formato é 400, sem chegar ao domínio. */
const idPipe = new ZodValidationPipe(z.uuid());

const MANAGE = { organizationWide: true };

/**
 * Adaptador HTTP das congregações (UC-05). A igreja vem do token; o `:id` só escolhe QUAL congregação DA IGREJA DO
 * USUÁRIO: id de outra igreja responde 404, igual a um inexistente, sem revelar que existe (ADR 0003).
 */
@Controller('congregations')
export class CongregationsController {
  constructor(
    @Inject(ListCongregationsUseCase)
    private readonly list: ListCongregationsUseCase,
    @Inject(RegisterCongregationUseCase)
    private readonly register: RegisterCongregationUseCase,
    @Inject(UpdateCongregationUseCase)
    private readonly update: UpdateCongregationUseCase,
    @Inject(DeactivateCongregationUseCase)
    private readonly deactivate: DeactivateCongregationUseCase,
    @Inject(ReactivateCongregationUseCase)
    private readonly reactivate: ReactivateCongregationUseCase,
    @Inject(DesignateHeadquartersUseCase)
    private readonly designateHeadquarters: DesignateHeadquartersUseCase,
  ) {}

  @RequirePermission(ORGANIZATION_READ)
  @Get()
  findAll(
    @CurrentContext() context: RequestContext,
    @Query(new ZodValidationPipe(listCongregationsQuerySchema))
    query: ListCongregationsQuery,
  ): Promise<Congregation[]> {
    return this.list.execute(context, query);
  }

  @RequirePermission(ORGANIZATION_MANAGE, MANAGE)
  @Post()
  create(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(registerCongregationRequestSchema))
    body: RegisterCongregationRequest,
  ): Promise<Congregation> {
    return this.register.execute(context, body);
  }

  @RequirePermission(ORGANIZATION_MANAGE, MANAGE)
  @Patch(':id')
  edit(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateCongregationRequestSchema))
    body: UpdateCongregationRequest,
  ): Promise<Congregation> {
    return this.update.execute(context, { ...body, congregationId: id });
  }

  // Ações de estado são POST em sub-recurso (e não PATCH de um campo `status`): cada uma tem regra própria
  // (a sede não pode ser desativada, só congregação ativa vira sede) e devolve a congregação já atualizada.
  @RequirePermission(ORGANIZATION_MANAGE, MANAGE)
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivateOne(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
  ): Promise<Congregation> {
    return this.deactivate.execute(context, { congregationId: id });
  }

  @RequirePermission(ORGANIZATION_MANAGE, MANAGE)
  @Post(':id/reactivate')
  @HttpCode(200)
  reactivateOne(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
  ): Promise<Congregation> {
    return this.reactivate.execute(context, { congregationId: id });
  }

  @RequirePermission(ORGANIZATION_MANAGE, MANAGE)
  @Post(':id/designate-headquarters')
  @HttpCode(200)
  designateOne(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
  ): Promise<Congregation> {
    return this.designateHeadquarters.execute(context, { congregationId: id });
  }
}
