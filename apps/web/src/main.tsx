import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createAuthClient } from './auth/client';
import { SessionProvider } from './auth/SessionProvider';
import { SessionManager } from './auth/session';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado em index.html.');

// Uma única sessão para a aplicação inteira (o token de acesso vive só na memória dela).
const session = new SessionManager(createAuthClient());

createRoot(root).render(
  <StrictMode>
    <SessionProvider session={session}>
      <App />
    </SessionProvider>
  </StrictMode>,
);
