import type { UserDirectoryAccess } from '../../application/resolve-user-directory.use-case.js';
import type { AccessPolicy } from '../../domain/access-policy.js';
import { Permission } from '../../domain/permission.js';

/**
 * Quem pode trocar ids de usuário por e-mails (ADR 0020): quem vê, em alguma tela, ids de "quem fez" ou "quem pediu".
 * São textos (e não as constantes dos outros módulos) para o `identity-access` não importar o financeiro nem a trilha
 * (isso formaria ciclos de importação); o teste da fábrica confere os textos com as constantes dos módulos dono.
 */
export const DIRECTORY_PERMISSIONS = [
  'finance:read',
  'finance:approve',
  'audit:read',
  'access:manage-users',
] as const;

const wanted = DIRECTORY_PERMISSIONS.map((permission) =>
  Permission.of(permission),
);

/** Basta ter UMA delas, em qualquer escopo: o que o diretório mostra (e-mail de quem pediu) não depende de congregação. */
export function userDirectoryAccessFrom(
  policy: AccessPolicy,
): UserDirectoryAccess {
  return { canResolve: () => wanted.some((p) => policy.hasPermission(p)) };
}
