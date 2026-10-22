import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from './SessionProvider';

/**
 * Protege um grupo de rotas: sem sessão, manda para a entrada e lembra de onde a pessoa queria ir. Com SENHA TEMPORÁRIA
 * ainda não trocada, manda para a troca (a API também recusa tudo até lá; isto só leva a pessoa ao lugar certo).
 * `allowPasswordChangePending` é só da própria tela de troca.
 */
export function RequireAuth({
  allowPasswordChangePending = false,
}: {
  allowPasswordChangePending?: boolean;
}) {
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
  if (state.user.mustChangePassword && !allowPasswordChangePending) {
    return <Navigate to="/trocar-senha" replace />;
  }
  return <Outlet />;
}
