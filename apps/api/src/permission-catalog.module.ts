import { Global, Module } from '@nestjs/common';
import { AUDIT_PERMISSIONS } from './modules/audit/index.js';
import { FINANCE_PERMISSIONS } from './modules/finance/index.js';
import {
  ACCESS_PERMISSIONS,
  PERMISSION_CATALOG,
} from './modules/identity-access/index.js';
import { MEMBERS_PERMISSIONS } from './modules/members/index.js';
import { ORGANIZATION_PERMISSIONS } from './modules/organization/index.js';
import type { PermissionDefinition } from './shared/application/permission-definition.js';

/**
 * Todas as permissões do sistema, cada uma descrita pelo módulo dono (ADR 0019). Fica na raiz, como o `AppModule`: é o
 * único lugar que conhece todos os módulos. Um módulo novo com permissões entra aqui; o teste deste arquivo confere que os
 * papéis de sistema só usam permissões do catálogo.
 */
export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  ...ORGANIZATION_PERMISSIONS,
  ...MEMBERS_PERMISSIONS,
  ...FINANCE_PERMISSIONS,
  ...AUDIT_PERMISSIONS,
  ...ACCESS_PERMISSIONS,
];

/** Global para o `identity-access` receber o catálogo sem importar os outros módulos (o que criaria um ciclo). */
@Global()
@Module({
  providers: [
    { provide: PERMISSION_CATALOG, useValue: PERMISSION_DEFINITIONS },
  ],
  exports: [PERMISSION_CATALOG],
})
export class PermissionCatalogModule {}
