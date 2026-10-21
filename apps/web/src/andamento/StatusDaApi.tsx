import type { EstadoApi } from '../api/health';

interface Visual {
  rotulo: string;
  cor: string;
}

function visualDe(estado: EstadoApi | null): Visual {
  if (estado === null)
    return { rotulo: 'Verificando a API…', cor: 'bg-slate-400' };
  switch (estado.tipo) {
    case 'offline':
      return { rotulo: 'API offline (rode pnpm dev)', cor: 'bg-red-500' };
    case 'resposta-invalida':
      return { rotulo: 'API respondeu algo inesperado', cor: 'bg-amber-500' };
    case 'online':
      return estado.saude.checks.database === 'up'
        ? { rotulo: 'API e banco no ar', cor: 'bg-emerald-500' }
        : {
            rotulo: 'API no ar, banco fora (rode pnpm db:up)',
            cor: 'bg-amber-500',
          };
  }
}

export function StatusDaApi({ estado }: { estado: EstadoApi | null }) {
  const { rotulo, cor } = visualDe(estado);
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm"
    >
      <span className={`size-2.5 rounded-full ${cor}`} aria-hidden="true" />
      {rotulo}
    </div>
  );
}
