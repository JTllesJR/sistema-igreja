import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from './SessionProvider';

/** Protege um grupo de rotas: sem sessão, manda para a entrada e lembra de onde a pessoa queria ir. */
export function RequireAuth() {
  const state = useSession();
  const location = useLocation();

  if (state.status === 'restoring') {
    return (
      <p className="text-sm text-slate-500" role="status">
        Carregando…
      </p>
    );
  }
  if (state.status === 'anonymous') {
    return (
      <Navigate
        to="/entrar"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <Outlet />;
}
