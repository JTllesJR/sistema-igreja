import { Body, Controller, Get, Inject, Patch } from '@nestjs/common';
import {
  type Organization,
  type RenameOrganizationRequest,
  renameOrganizationRequestSchema,
  organizationSchema,
} from '@igreja/contracts';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import { GetOrganizationUseCase } from '../../application/get-organization.use-case.js';
import { RenameOrganizationUseCase } from '../../application/rename-organization.use-case.js';
import {
  ORGANIZATION_MANAGE,
  ORGANIZATION_READ,
} from '../../organization.permissions.js';
import { ApiDoc } from '../../../../platform/openapi/api-doc.decorator.js';

/**
 * Adaptador HTTP da igreja do usuário logado. Não há `:id` na rota: a igreja vem SEMPRE do token (ADR 0003), então
 * não existe caminho para consultar ou alterar a de outra pessoa.
 */
@Controller('organization')
export class OrganizationController {
  constructor(
    @Inject(GetOrganizationUseCase)
    private readonly getOrganization: GetOrganizationUseCase,
    @Inject(RenameOrganizationUseCase)
    private readonly renameOrganization: RenameOrganizationUseCase,
  ) {}

  @RequirePermission(ORGANIZATION_READ)
  @ApiDoc({
    summary: 'Devolve a igreja do usuário.',
    response: organizationSchema,
  })
  @Get()
  get(@CurrentContext() context: RequestContext): Promise<Organization> {
    return this.getOrganization.execute(context);
  }

  @RequirePermission(ORGANIZATION_MANAGE, { organizationWide: true })
  @ApiDoc({
    summary: 'Renomeia a igreja.',
    response: organizationSchema,
  })
  @Patch()
  rename(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(renameOrganizationRequestSchema))
    body: RenameOrganizationRequest,
  ): Promise<Organization> {
    return this.renameOrganization.execute(context, body);
  }
}
