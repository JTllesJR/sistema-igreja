import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  RegisterCongregationRequest,
  UpdateCongregationRequest,
} from '@igreja/contracts';
import { useApis } from '../api/context';

/** Chave do cache: toda mutação a invalida, e a lista é buscada de novo. */
export const CONGREGATIONS_KEY = ['congregations'] as const;

export function useCongregations() {
  const { congregations } = useApis();
  return useQuery({
    queryKey: CONGREGATIONS_KEY,
    queryFn: () => congregations.list(),
  });
}

/** Mutações das congregações; cada uma atualiza a lista em cache ao terminar. */
export function useCongregationMutations() {
  const { congregations } = useApis();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: CONGREGATIONS_KEY });

  return {
    create: useMutation({
      mutationFn: (request: RegisterCongregationRequest) =>
        congregations.create(request),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (input: { id: string; request: UpdateCongregationRequest }) =>
        congregations.update(input.id, input.request),
      onSuccess: refresh,
    }),
    deactivate: useMutation({
      mutationFn: (id: string) => congregations.deactivate(id),
      onSuccess: refresh,
    }),
    reactivate: useMutation({
      mutationFn: (id: string) => congregations.reactivate(id),
      onSuccess: refresh,
    }),
    designateHeadquarters: useMutation({
      mutationFn: (id: string) => congregations.designateHeadquarters(id),
      onSuccess: refresh,
    }),
  };
}
