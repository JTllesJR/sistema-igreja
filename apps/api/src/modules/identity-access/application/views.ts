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
