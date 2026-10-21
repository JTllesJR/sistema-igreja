import {
  congregationSchema,
  type Congregation,
  type CongregationStatus,
  type RegisterCongregationRequest,
  type UpdateCongregationRequest,
} from '@igreja/contracts';
import type { AuthorizedApi } from '../auth/authorized-api';

export interface CongregationsApi {
  list(status?: CongregationStatus): Promise<Congregation[]>;
  create(request: RegisterCongregationRequest): Promise<Congregation>;
  update(id: string, request: UpdateCongregationRequest): Promise<Congregation>;
  deactivate(id: string): Promise<Congregation>;
  reactivate(id: string): Promise<Congregation>;
  designateHeadquarters(id: string): Promise<Congregation>;
}

export function createCongregationsApi(api: AuthorizedApi): CongregationsApi {
  const one = (path: string, method: string, body?: unknown) =>
    api.request(
      path,
      body === undefined ? { method } : { method, body },
      congregationSchema,
    );

  return {
    list: (status) =>
      api.request(
        `/congregations${status ? `?status=${status}` : ''}`,
        { method: 'GET' },
        congregationSchema.array(),
      ),
    create: (request) => one('/congregations', 'POST', request),
    update: (id, request) =>
      one(`/congregations/${encodeURIComponent(id)}`, 'PATCH', request),
    deactivate: (id) =>
      one(`/congregations/${encodeURIComponent(id)}/deactivate`, 'POST'),
    reactivate: (id) =>
      one(`/congregations/${encodeURIComponent(id)}/reactivate`, 'POST'),
    designateHeadquarters: (id) =>
      one(
        `/congregations/${encodeURIComponent(id)}/designate-headquarters`,
        'POST',
      ),
  };
}
