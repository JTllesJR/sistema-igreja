import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateUserRequest,
  RoleAssignmentRequest,
} from '@igreja/contracts';
import { useApis } from '../api/context';

export const USERS_KEY = ['users'] as const;

// Lista de pessoas e papéis: dado de administração, sem cache "fresco" e descartado logo.
const FRESH = { staleTime: 0, gcTime: 60_000 } as const;

export function useUsers() {
  const { users } = useApis();
  return useQuery({
    queryKey: [...USERS_KEY, 'list'],
    queryFn: () => users.list(),
    ...FRESH,
  });
}

export function useRoles() {
  const { users } = useApis();
  return useQuery({
    queryKey: [...USERS_KEY, 'roles'],
    queryFn: () => users.roles(),
    ...FRESH,
  });
}

/**
 * Mutações de usuários. As que devolvem SENHA TEMPORÁRIA (criar e redefinir) usam `gcTime: 0`: o TanStack Query não
 * guarda o resultado depois que a tela o recebe. Quem chama mostra a senha e a descarta; ela nunca fica em cache.
 */
export function useUserMutations() {
  const { users } = useApis();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: USERS_KEY });

  return {
    create: useMutation({
      mutationFn: (request: CreateUserRequest) => users.create(request),
      onSuccess: refresh,
      gcTime: 0,
    }),
    resetPassword: useMutation({
      mutationFn: (id: string) => users.resetPassword(id),
      onSuccess: refresh,
      gcTime: 0,
    }),
    assignRole: useMutation({
      mutationFn: (input: { id: string; request: RoleAssignmentRequest }) =>
        users.assignRole(input.id, input.request),
      onSuccess: refresh,
    }),
    revokeRole: useMutation({
      mutationFn: (input: { id: string; request: RoleAssignmentRequest }) =>
        users.revokeRole(input.id, input.request),
      onSuccess: refresh,
    }),
    disable: useMutation({
      mutationFn: (id: string) => users.disable(id),
      onSuccess: refresh,
    }),
    enable: useMutation({
      mutationFn: (id: string) => users.enable(id),
      onSuccess: refresh,
    }),
  };
}
