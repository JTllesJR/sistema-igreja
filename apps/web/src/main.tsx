import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiProvider } from './api/context';
import { App } from './App';
import { createAuthorizedApi } from './auth/authorized-api';
import { createAuthClient } from './auth/client';
import { createHttp, ApiError } from './auth/http';
import { SessionProvider } from './auth/SessionProvider';
import { SessionManager } from './auth/session';
import { createCongregationsApi } from './congregations/api';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado em index.html.');

// Uma única sessão para a aplicação inteira (o token de acesso vive só na memória dela).
const http = createHttp();
const session = new SessionManager(createAuthClient());
const authorized = createAuthorizedApi(http, session);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Erro 4xx (permissão, sessão, regra) não melhora repetindo; só vale insistir quando a rede falhou.
      retry: (failures, error) =>
        failures < 2 &&
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ),
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <SessionProvider session={session}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider
          apis={{ congregations: createCongregationsApi(authorized) }}
        >
          <App />
        </ApiProvider>
      </QueryClientProvider>
    </SessionProvider>
  </StrictMode>,
);
