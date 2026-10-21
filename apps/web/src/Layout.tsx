import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { StatusDaApi } from './andamento/StatusDaApi';
import { consultarSaude, type EstadoApi } from './api/health';
import { useSession } from './auth/SessionProvider';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive
      ? 'bg-slate-100 text-slate-900'
      : 'text-slate-600 hover:text-slate-900'
  }`;

export function Layout() {
  const session = useSession();
  const [estado, setEstado] = useState<EstadoApi | null>(null);

  useEffect(() => {
    let ativo = true;
    const atualizar = () =>
      void consultarSaude().then((novo) => {
        if (ativo) setEstado(novo);
      });
    atualizar();
    const intervalo = setInterval(atualizar, 10_000);
    return () => {
      ativo = false;
      clearInterval(intervalo);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link
            to="/"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-slate-900"
          >
            <span className="block text-xl font-semibold">
              Sistema de Igreja
            </span>
            <span className="block text-sm text-slate-500">
              Gestão de congregações
            </span>
          </Link>
          <nav
            aria-label="Principal"
            className="flex flex-wrap items-center gap-1"
          >
            <NavLink to="/" end className={linkClass}>
              Andamento
            </NavLink>
            {session.status === 'authenticated' ? (
              <NavLink to="/conta" className={linkClass}>
                Minha conta
              </NavLink>
            ) : (
              <NavLink to="/entrar" className={linkClass}>
                Entrar
              </NavLink>
            )}
          </nav>
          <StatusDaApi estado={estado} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
