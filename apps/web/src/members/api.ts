import {
  memberCreatedSchema,
  memberDetailSchema,
  memberListResponseSchema,
  type ChangeMemberStatusRequest,
  type ListMembersQuery,
  type MemberCreated,
  type MemberDetail,
  type MemberListResponse,
  type RecordMemberEventRequest,
  type RegisterMemberRequest,
  type TransferMemberRequest,
  type UpdateMemberRequest,
} from '@igreja/contracts';
import type { AuthorizedApi } from '../auth/authorized-api';

export interface MembersApi {
  list(query: ListMembersQuery): Promise<MemberListResponse>;
  detail(id: string): Promise<MemberDetail>;
  create(request: RegisterMemberRequest): Promise<MemberCreated>;
  update(id: string, request: UpdateMemberRequest): Promise<void>;
  changeStatus(id: string, request: ChangeMemberStatusRequest): Promise<void>;
  transfer(id: string, request: TransferMemberRequest): Promise<void>;
  recordEvent(id: string, request: RecordMemberEventRequest): Promise<void>;
  anonymize(id: string): Promise<void>;
}

/** Só inclui na URL o que foi informado (nada de `?search=undefined`). */
export function toQueryString(query: ListMembersQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

export function createMembersApi(api: AuthorizedApi): MembersApi {
  const path = (id: string, suffix = '') =>
    `/members/${encodeURIComponent(id)}${suffix}`;
  const send = (url: string, method: string, body?: unknown) =>
    api.request<void>(
      url,
      body === undefined ? { method } : { method, body },
      null,
    );

  return {
    list: (query) =>
      api.request(
        `/members${toQueryString(query)}`,
        { method: 'GET' },
        memberListResponseSchema,
      ),
    detail: (id) =>
      api.request(path(id), { method: 'GET' }, memberDetailSchema),
    create: (request) =>
      api.request(
        '/members',
        { method: 'POST', body: request },
        memberCreatedSchema,
      ),
    update: (id, request) => send(path(id), 'PATCH', request),
    changeStatus: (id, request) => send(path(id, '/status'), 'POST', request),
    transfer: (id, request) => send(path(id, '/transfer'), 'POST', request),
    recordEvent: (id, request) => send(path(id, '/history'), 'POST', request),
    anonymize: (id) => send(path(id, '/anonymize'), 'POST'),
  };
}
