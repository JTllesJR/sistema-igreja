import { useNavigate } from 'react-router';
import { useSession, useSessionManager } from '../auth/SessionProvider';

export function ContaPage() {
  const sessionManager = useSessionManager();
  const session = useSession();
  const navigate = useNavigate();

  // O RequireAuth já garante isso; a checagem estreita o tipo e protege contra uso fora dele.
  if (session.status !== 'authenticated') return null;
  const { user } = session;

  async function sair() {
    await sessionManager.logout();
    void navigate('/entrar', { replace: true });
  }

  return (
    <section
      aria-labelledby="conta"
      className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h2 id="conta" className="text-lg font-semibold">
        Minha conta
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-slate-500">E-mail</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Papéis</dt>
          <dd>
            {user.roles.length === 0 ? (
              <span className="text-slate-600">Nenhum papel atribuído.</span>
            ) : (
              <ul className="mt-1 space-y-1">
                {user.roles.map((role) => (
                  <li
                    key={`${role.roleId}:${role.congregationId ?? ''}`}
                    className="font-medium"
                  >
                    {role.roleName}
                    <span className="ml-2 font-normal text-slate-600">
                      {role.congregationId === null
                        ? 'Igreja toda'
                        : 'Uma congregação'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => void sair()}
        className="mt-6 h-11 w-full rounded-lg border border-slate-400 bg-white px-4 text-base font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        Sair
      </button>
    </section>
  );
}
