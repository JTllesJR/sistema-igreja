import { useEffect, useState } from 'react';
import { consultarSaude, type EstadoApi } from './api/health';
import { Painel } from './andamento/Painel';
import { StatusDaApi } from './andamento/StatusDaApi';

export function App() {
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
          <div>
            <h1 className="text-xl font-semibold">Sistema de Igreja</h1>
            <p className="text-sm text-slate-500">
              Andamento do desenvolvimento
            </p>
          </div>
          <StatusDaApi estado={estado} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Painel />
      </main>
    </div>
  );
}
