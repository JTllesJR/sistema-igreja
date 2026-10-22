import type { PermissionDefinition } from '../../shared/application/permission-definition.js';

/**
 * Permissões do módulo `identity-access` (ADR 0004: cada módulo define as suas). O Administrador as tem pelo curinga `*`.
 */

/**
 * Administrar usuários e seus papéis da igreja (ADR 0014). Exige a igreja toda: quem opera uma congregação não
 * administra as pessoas da igreja.
 */
export const ACCESS_MANAGE_USERS = 'access:manage-users';

/** Para o catálogo de permissões (ADR 0019). Fica FORA dos papéis personalizados: só o Administrador gere acessos. */
export const ACCESS_PERMISSIONS: readonly PermissionDefinition[] = [
  {
    key: ACCESS_MANAGE_USERS,
    description:
      'Administrar usuários, papéis e permissões. Só vale para a igreja toda.',
  },
];
