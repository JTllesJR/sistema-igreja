import { z } from 'zod';

/**
 * Contratos de papéis e usuários (módulo `identity-access`, ADR 0014).
 * O login e o usuário atual ficam em `auth.ts`.
 */

/** Um papel da igreja. `permissions` são textos `modulo:acao` (ou `*`, que concede tudo), em ordem alfabética. */
export const roleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Papel de sistema: não pode ser editado nem excluído. */
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
});
export type Role = z.infer<typeof roleSchema>;

/** Um papel atribuído a um usuário. `congregationId` nulo = vale para a igreja toda. */
export const userRoleSchema = z.object({
  roleId: z.uuid(),
  roleName: z.string(),
  congregationId: z.uuid().nullable(),
});
export type UserRole = z.infer<typeof userRoleSchema>;

/** Um usuário da igreja na tela de administração. Nunca traz hash de senha nem dados de bloqueio. */
export const userSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  status: z.enum(['ACTIVE', 'DISABLED']),
  /** Instante do último login (ISO 8601) ou null se nunca entrou. */
  lastLoginAt: z.iso.datetime().nullable(),
  roles: z.array(userRoleSchema),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/** Atribuir ou revogar um papel. `congregationId: null` = igreja toda. */
export const roleAssignmentRequestSchema = z.object({
  roleId: z.uuid(),
  congregationId: z.uuid().nullable(),
});
export type RoleAssignmentRequest = z.infer<typeof roleAssignmentRequestSchema>;
