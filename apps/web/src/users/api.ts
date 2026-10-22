import {
  roleSchema,
  temporaryPasswordResponseSchema,
  userSummarySchema,
  type CreateUserRequest,
  type Role,
  type RoleAssignmentRequest,
  type TemporaryPasswordResponse,
  type UserSummary,
} from '@igreja/contracts';
import type { AuthorizedApi } from '../auth/authorized-api';

export interface UsersApi {
  list(): Promise<UserSummary[]>;
  roles(): Promise<Role[]>;
  /** A resposta traz a senha temporária, que só existe aqui: quem chama a mostra e a descarta. */
  create(request: CreateUserRequest): Promise<TemporaryPasswordResponse>;
  assignRole(id: string, request: RoleAssignmentRequest): Promise<UserSummary>;
  revokeRole(id: string, request: RoleAssignmentRequest): Promise<UserSummary>;
  disable(id: string): Promise<UserSummary>;
  enable(id: string): Promise<UserSummary>;
  resetPassword(id: string): Promise<TemporaryPasswordResponse>;
}

export function createUsersApi(api: AuthorizedApi): UsersApi {
  const path = (id: string, suffix: string) =>
    `/users/${encodeURIComponent(id)}${suffix}`;
  const post = <T>(
    url: string,
    schema: {
      safeParse(v: unknown): { success: true; data: T } | { success: false };
    },
    body?: unknown,
  ) =>
    api.request(
      url,
      body === undefined ? { method: 'POST' } : { method: 'POST', body },
      schema,
    );

  return {
    list: () =>
      api.request('/users', { method: 'GET' }, userSummarySchema.array()),
    roles: () => api.request('/roles', { method: 'GET' }, roleSchema.array()),
    create: (request) =>
      post('/users', temporaryPasswordResponseSchema, request),
    assignRole: (id, request) =>
      post(path(id, '/assignments'), userSummarySchema, request),
    revokeRole: (id, request) =>
      post(path(id, '/assignments/revoke'), userSummarySchema, request),
    disable: (id) => post(path(id, '/disable'), userSummarySchema),
    enable: (id) => post(path(id, '/enable'), userSummarySchema),
    resetPassword: (id) =>
      post(path(id, '/reset-password'), temporaryPasswordResponseSchema),
  };
}
