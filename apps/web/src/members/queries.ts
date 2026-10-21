import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  ChangeMemberStatusRequest,
  ListMembersQuery,
  RecordMemberEventRequest,
  RegisterMemberRequest,
  TransferMemberRequest,
  UpdateMemberRequest,
} from '@igreja/contracts';
import { useApis } from '../api/context';

export const MEMBERS_KEY = ['members'] as const;

// Dados sensíveis: sem cache "fresco" (cada abertura de ficha é uma leitura nova, e fica registrada) e descartados logo.
const SENSITIVE = { staleTime: 0, gcTime: 60_000 } as const;

export function useMemberList(query: ListMembersQuery) {
  const { members } = useApis();
  return useQuery({
    queryKey: [...MEMBERS_KEY, 'list', query],
    queryFn: () => members.list(query),
    // Troca de página/filtro sem piscar; o dado antigo some junto com o resto quando a sessão acaba (clear-on-logout).
    placeholderData: keepPreviousData,
    ...SENSITIVE,
  });
}

export function useMember(id: string) {
  const { members } = useApis();
  return useQuery({
    queryKey: [...MEMBERS_KEY, 'detail', id],
    queryFn: () => members.detail(id),
    // Nada de repetir sozinho: cada tentativa seria uma leitura a mais na trilha de auditoria.
    retry: false,
    refetchOnWindowFocus: false,
    ...SENSITIVE,
  });
}

/** Mutações; cada uma invalida TODO o cache de membros (a ficha e as listas se refazem na próxima leitura). */
export function useMemberMutations() {
  const { members } = useApis();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: MEMBERS_KEY });

  return {
    create: useMutation({
      mutationFn: (request: RegisterMemberRequest) => members.create(request),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; request: UpdateMemberRequest }) =>
        members.update(input.id, input.request),
      onSuccess: refresh,
    }),
    changeStatus: useMutation({
      mutationFn: (input: { id: string; request: ChangeMemberStatusRequest }) =>
        members.changeStatus(input.id, input.request),
      onSuccess: refresh,
    }),
    transfer: useMutation({
      mutationFn: (input: { id: string; request: TransferMemberRequest }) =>
        members.transfer(input.id, input.request),
      onSuccess: refresh,
    }),
    recordEvent: useMutation({
      mutationFn: (input: { id: string; request: RecordMemberEventRequest }) =>
        members.recordEvent(input.id, input.request),
      onSuccess: refresh,
    }),
    anonymize: useMutation({
      mutationFn: (id: string) => members.anonymize(id),
      onSuccess: refresh,
    }),
  };
}
