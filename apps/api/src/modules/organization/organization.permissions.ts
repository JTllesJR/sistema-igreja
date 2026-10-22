import type { PermissionDefinition } from '../../shared/application/permission-definition.js';

/**
 * Permissões do módulo `organization` (ADR 0004: cada módulo define as suas; `identity-access` só valida o formato).
 * O papel Administrador as tem todas pelo curinga `*`; papéis personalizados (UC-02) poderão recebê-las separadamente.
 */

/** Ver a igreja e a lista de congregações. Basta tê-la em algum escopo: quem opera uma congregação precisa enxergar as outras. */
export const ORGANIZATION_READ = 'organization:read';

/** Mudar o nome da igreja e criar, editar, desativar, reativar congregações e designar a sede: exige a igreja toda. */
export const ORGANIZATION_MANAGE = 'organization:manage';

/** Para o catálogo de permissões (ADR 0019): o que aparece ao montar um papel. */
export const ORGANIZATION_PERMISSIONS: readonly PermissionDefinition[] = [
  { key: ORGANIZATION_READ, description: 'Ver a igreja e as congregações.' },
  {
    key: ORGANIZATION_MANAGE,
    description:
      'Alterar a igreja e criar, editar, desativar e reativar congregações. Só vale para a igreja toda.',
  },
];
