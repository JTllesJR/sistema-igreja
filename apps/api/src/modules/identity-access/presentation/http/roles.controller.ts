import { Controller, Get, Inject } from '@nestjs/common';
import type { Role } from '@igreja/contracts';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import { ListRolesUseCase } from '../../application/list-roles.use-case.js';
import { ACCESS_MANAGE_USERS } from '../../access.permissions.js';
import { roleSchema } from '@igreja/contracts';
import { ApiDoc } from '../../../../platform/openapi/api-doc.decorator.js';
import { z } from 'zod';

/** Adaptador HTTP dos papéis (UC-02, versão enxuta do ADR 0014): por ora só a consulta. */
@Controller('roles')
export class RolesController {
  constructor(
    @Inject(ListRolesUseCase) private readonly list: ListRolesUseCase,
  ) {}

  @RequirePermission(ACCESS_MANAGE_USERS, { organizationWide: true })
  @ApiDoc({
    summary: 'Lista os papéis da igreja, com as permissões de cada um.',
    response: z.array(roleSchema),
  })
  @Get()
  findAll(@CurrentContext() context: RequestContext): Promise<Role[]> {
    return this.list.execute(context);
  }
}
