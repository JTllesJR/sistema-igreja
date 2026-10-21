import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { SessionManager, SessionState } from './session';

const SessionContext = createContext<SessionManager | null>(null);

/** Entrega o gerenciador de sessão à árvore e tenta recuperar a sessão (cookie de renovação) ao abrir a página. */
export function SessionProvider({
  session,
  children,
}: {
  session: SessionManager;
  children: ReactNode;
}) {
  useEffect(() => {
    void session.restore();
  }, [session]);

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionManager(): SessionManager {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSessionManager fora do SessionProvider.');
  return session;
}

/** O estado atual da sessão; a tela se redesenha quando ele muda. */
export function useSession(): SessionState {
  const session = useSessionManager();
  return useSyncExternalStore(session.subscribe, session.getState);
}
