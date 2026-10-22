import type { Role } from '../domain/role.js';
import type { User } from '../domain/user.js';

/** Um papel atribuído ao usuário, com o escopo (`congregationId` nulo = igreja toda). */
export interface AssignedRoleView {
  roleId: string;
  roleName: string;
  isSystem: boolean;
  /** O que o papel concede (`modulo:acao` ou `*`), para a interface mostrar só o que a pessoa pode fazer. */
  permissions: string[];
  congregationId: string | null;
}

/** Um papel da igreja, para a tela de usuários escolher. Permissões em ordem alfabética. */
export interface RoleView {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

export function toRoleView(role: Role): RoleView {
  return {
    id: role.id,
    name: role.name.value,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p) => p.value).sort(),
  };
}

/** Um usuário na tela de administração. Sem hash de senha nem dados de bloqueio. */
export interface UserSummaryView {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  /** ISO 8601, ou null se nunca entrou. */
  lastLoginAt: string | null;
  roles: { roleId: string; roleName: string; congregationId: string | null }[];
}

/** `roles` são os papéis DA igreja; atribuição de papel que não está na lista (apagado) simplesmente não aparece. */
export function toUserSummaryView(
  user: User,
  roles: readonly Role[],
): UserSummaryView {
  const byId = new Map(roles.map((role) => [role.id, role]));

  return {
    id: user.id,
    email: user.email.value,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    roles: user.assignments.flatMap((assignment) => {
      const role = byId.get(assignment.roleId);
      return role
        ? [
            {
              roleId: role.id,
              roleName: role.name.value,
              congregationId: assignment.congregationId,
            },
          ]
        : [];
    }),
  };
}

/** Quem é o usuário logado. Nunca inclui hash de senha nem dados de segurança. */
export interface CurrentUserView {
  id: string;
  organizationId: string;
  email: string;
  roles: AssignedRoleView[];
}

/** Os tokens entregues ao cliente. O token de renovação só existe aqui (em texto); no banco fica o hash. */
export interface TokensView {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface AuthenticationView extends TokensView {
  user: CurrentUserView;
}

export function toCurrentUserView(
  user: User,
  roles: readonly Role[],
): CurrentUserView {
  const byId = new Map(roles.map((role) => [role.id, role]));

  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email.value,
    roles: user.assignments.flatMap((assignment) => {
      const role = byId.get(assignment.roleId);
      return role
        ? [
            {
              roleId: role.id,
              roleName: role.name.value,
              isSystem: role.isSystem,
              permissions: role.permissions.map((p) => p.value),
              congregationId: assignment.congregationId,
            },
          ]
        : [];
    }),
  };
}
