import { z } from 'zod';

/**
 * Contratos de autenticação (ADR 0010 e 0011). A API valida a entrada e produz a saída com estes schemas;
 * a web usa os mesmos para validar e tipar.
 *
 * O token de renovação NÃO aparece aqui: ele vai e volta num cookie `httpOnly`, fora do alcance do JavaScript da página.
 */

// Limites só para barrar entrada absurda (o corpo já é limitado a 100 kb). A política de senha de verdade (10 a 128
// caracteres) fica no domínio; no login, senha fora da política é "credenciais inválidas", sem dar pistas.
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 256;

export const loginRequestSchema = z.object({
  email: z.string().min(1).max(MAX_EMAIL_LENGTH),
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
  newPassword: z.string().min(1).max(MAX_PASSWORD_LENGTH),
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** Um papel do usuário; `congregationId` nulo significa "a igreja toda". */
export const assignedRoleSchema = z.object({
  roleId: z.string(),
  roleName: z.string(),
  isSystem: z.boolean(),
  congregationId: z.string().nullable(),
});

/** Quem está logado. Nunca inclui hash de senha nem dados de segurança. */
export const currentUserSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string(),
  roles: z.array(assignedRoleSchema),
});
export type CurrentUser = z.infer<typeof currentUserSchema>;

/** O token de acesso fica só em memória no navegador; `accessTokenExpiresAt` permite renová-lo antes de vencer. */
export const accessTokenResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
});
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

export const loginResponseSchema = accessTokenResponseSchema.extend({
  user: currentUserSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
