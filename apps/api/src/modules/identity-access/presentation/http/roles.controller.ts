import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type CreateRoleRequest,
  createRoleRequestSchema,
  type PermissionDefinition,
  permissionDefinitionSchema,
  type Role,
  roleSchema,
  type UpdateRoleRequest,
  updateRoleRequestSchema,
} from '@igreja/contracts';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { PermissionDefinition as CatalogEntry } from '../../../../shared/application/permission-definition.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
import { ListRolesUseCase } from '../../application/list-roles.use-case.js';
import {
  CreateRoleUseCase,
  DeleteRoleUseCase,
  UpdateRoleUseCase,
  selectablePermissions,
} from '../../application/role-editor.use-cases.js';
import { ACCESS_MANAGE_USERS } from '../../access.permissions.js';
import { PERMISSION_CATALOG } from '../../identity-access.tokens.js';
import { ApiDoc } from '../../../../platform/openapi/api-doc.decorator.js';
import { z } from 'zod';

const idPipe = new ZodValidationPipe(z.uuid());
const MANAGE = [ACCESS_MANAGE_USERS, { organizationWide: true }] as const;

/** Adaptador HTTP dos papéis (UC-02): lista e editor de papéis personalizados (ADR 0014 e 0019). */
@Controller('roles')
export class RolesController {
  constructor(
    @Inject(ListRolesUseCase) private readonly list: ListRolesUseCase,
    @Inject(CreateRoleUseCase) private readonly create: CreateRoleUseCase,
    @Inject(UpdateRoleUseCase) private readonly update: UpdateRoleUseCase,
    @Inject(DeleteRoleUseCase) private readonly remove: DeleteRoleUseCase,
    @Inject(PERMISSION_CATALOG)
    private readonly catalog: readonly CatalogEntry[],
  ) {}

  @RequirePermission(...MANAGE)
  @ApiDoc({
    summary: 'Lista os papéis da igreja, com as permissões de cada um.',
    response: z.array(roleSchema),
  })
  @Get()
  findAll(@CurrentContext() context: RequestContext): Promise<Role[]> {
    return this.list.execute(context);
  }

  @RequirePermission(...MANAGE)
  @ApiDoc({
    summary:
      'Lista as permissões que um papel personalizado pode receber, com a descrição de cada uma.',
    response: z.array(permissionDefinitionSchema),
  })
  @Get('permissions')
  permissions(): PermissionDefinition[] {
    return selectablePermissions(this.catalog);
  }

  @RequirePermission(...MANAGE)
  @ApiDoc({
    summary: 'Cria um papel personalizado.',
    description:
      'Só permissões do catálogo; nunca `*` nem `access:manage-users`, que ficam com o Administrador.',
    response: roleSchema,
  })
  @Post()
  createRole(
    @CurrentContext() context: RequestContext,
    @Body(new ZodValidationPipe(createRoleRequestSchema))
    body: CreateRoleRequest,
  ): Promise<Role> {
    return this.create.execute(context, body);
  }

  @RequirePermission(...MANAGE)
  @ApiDoc({
    summary: 'Altera o nome e/ou as permissões de um papel personalizado.',
    description:
      'Papéis padrão não se alteram (409). Vale na hora para quem tem o papel.',
    response: roleSchema,
  })
  @Patch(':id')
  updateRole(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateRoleRequestSchema))
    body: UpdateRoleRequest,
  ): Promise<Role> {
    return this.update.execute(context, { ...body, roleId: id });
  }

  @RequirePermission(...MANAGE)
  @ApiDoc({
    summary: 'Exclui um papel personalizado.',
    description:
      'Recusado (409) se for papel padrão ou se ainda estiver atribuído a alguém.',
    response: null,
  })
  @Delete(':id')
  @HttpCode(204)
  async deleteRole(
    @CurrentContext() context: RequestContext,
    @Param('id', idPipe) id: string,
  ): Promise<void> {
    await this.remove.execute(context, id);
  }
}
