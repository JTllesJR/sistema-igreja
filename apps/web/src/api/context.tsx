import { createContext, useContext, type ReactNode } from 'react';
import type { CongregationsApi } from '../congregations/api';
import type { MembersApi } from '../members/api';

/** Os clientes da API que as telas usam. Montados em `main.tsx` (e substituíveis por falsos nos testes). */
export interface Apis {
  congregations: CongregationsApi;
  members: MembersApi;
}

const ApiContext = createContext<Apis | null>(null);

export function ApiProvider({
  apis,
  children,
}: {
  apis: Apis;
  children: ReactNode;
}) {
  return <ApiContext.Provider value={apis}>{children}</ApiContext.Provider>;
}

export function useApis(): Apis {
  const apis = useContext(ApiContext);
  if (!apis) throw new Error('useApis fora do ApiProvider.');
  return apis;
}
