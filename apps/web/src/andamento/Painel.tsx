import {
  agruparPorModulo,
  casosDeUso,
  resumir,
  type Status,
} from './casos-de-uso';

const rotulos: Record<Status, { texto: string; classe: string }> = {
  concluido: { texto: 'Concluído', classe: 'bg-emerald-100 text-emerald-800' },
  backend: { texto: 'Backend pronto', classe: 'bg-sky-100 text-sky-800' },
  planejado: { texto: 'Planejado', classe: 'bg-slate-100 text-slate-600' },
};

export function Painel() {
  const resumo = resumir(casosDeUso);
  const grupos = agruparPorModulo(casosDeUso);

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="resumo"
        className="rounded-xl border border-slate-200 bg-white p-5"
      >
        <h2 id="resumo" className="text-lg font-semibold">
          Casos de uso do MVP
        </h2>
        <div
          role="progressbar"
          aria-valuenow={resumo.percentualConcluido}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Casos de uso concluídos"
          className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${resumo.percentualConcluido}%` }}
          />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Numero rotulo="Total" valor={resumo.total} />
          <Numero rotulo="Concluídos" valor={resumo.concluidos} />
          <Numero rotulo="Backend pronto" valor={resumo.backend} />
          <Numero rotulo="Planejados" valor={resumo.planejados} />
        </dl>
        <p className="mt-3 text-sm text-slate-500">
          “Backend pronto” significa regra de negócio e banco testados; falta a
          tela e, em alguns casos, expor por HTTP.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {grupos.map(([modulo, itens]) => (
          <section
            key={modulo}
            aria-label={modulo}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <h3 className="font-semibold">{modulo}</h3>
            <ul className="mt-3 divide-y divide-slate-100">
              {itens.map((caso) => {
                const rotulo = rotulos[caso.status];
                return (
                  <li
                    key={caso.id}
                    className="flex items-start justify-between gap-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-mono text-xs text-slate-500">
                        {caso.id}
                      </span>{' '}
                      {caso.titulo}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${rotulo.classe}`}
                    >
                      {rotulo.texto}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="text-2xl font-semibold">{valor}</dd>
    </div>
  );
}
