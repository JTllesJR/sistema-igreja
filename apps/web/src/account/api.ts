import type { ChangePasswordRequest } from '@igreja/contracts';
import type { AuthorizedApi } from '../auth/authorized-api';

export interface AccountApi {
  /** Troca a PRÓPRIA senha (a da pessoa logada). Responde 204. */
  changePassword(request: ChangePasswordRequest): Promise<void>;
}

export function createAccountApi(api: AuthorizedApi): AccountApi {
  return {
    changePassword: (request) =>
      api.request<void>(
        '/auth/change-password',
        { method: 'POST', body: request },
        null,
      ),
  };
}
