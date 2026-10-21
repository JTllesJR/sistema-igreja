import type { CurrentUser } from '@igreja/contracts';

/**
 * Espelho SIMPLIFICADO da política de acesso da API (`AccessPolicy`), só para a interface decidir o que MOSTRAR.
 * Quem decide de verdade é a API: ela responde 403 (ou 404, fora do escopo) a quem não pode, mesmo que um botão
 * apareça por engano aqui. Nunca use isto como proteção.
 */

type Role = CurrentUser['roles'][number];

const grants = (role: Role, permission: string): boolean =>
  role.permissions.includes('*') || role.permissions.includes(permission);

/**
 * Tem a permissão? Sem `congregationId`, só vale para a IGREJA TODA; com ele, vale a atribuição da igreja toda ou a
 * restrita àquela congregação.
 */
export function hasPermission(
  user: CurrentUser,
  permission: string,
  congregationId?: string,
): boolean {
  return user.roles.some(
    (role) =>
      grants(role, permission) &&
      (role.congregationId === null ||
        (congregationId !== undefined &&
          role.congregationId === congregationId)),
  );
}

/** Tem a permissão em ALGUM escopo? (É o que a API exige para entrar na rota.) */
export function hasPermissionAnywhere(
  user: CurrentUser,
  permission: string,
): boolean {
  return user.roles.some((role) => grants(role, permission));
}
