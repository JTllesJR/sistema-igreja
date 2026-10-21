import { useState } from 'react';
import { Link } from 'react-router';
import type { Congregation } from '@igreja/contracts';
import { ApiError } from '../auth/http';
import { useSession } from '../auth/SessionProvider';
import {
  canManageOrganization,
  describeServiceTime,
  summarizeAddress,
} from '../congregations/form';
import {
  useCongregationMutations,
  useCongregations,
} from '../congregations/queries';
import { ErrorAlert } from '../ui/Field';
import {
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallButtonClass,
} from '../ui/styles';

type Filter = 'ALL' | 'ACTIVE' | 'INACTIVE';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'ACTIVE', label: 'Ativas' },
  { value: 'INACTIVE', label: 'Inativas' },
];

const badge = 'rounded-full px-2 py-0.5 text-xs font-medium';

export function CongregacoesPage() {
  const session = useSession();
  const query = useCongregations();
  const mutations = useCongregationMutations();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);

  const canManage =
    session.status === 'authenticated' && canManageOrganization(session.user);

  const run = (
    mutate: (id: string, options: object) => void,
    id: string,
    confirmation?: string,
  ) => {
    if (confirmation && !window.confirm(confirmation)) return;
    setActionError(null);
    mutate(id, {
      onError: (error: unknown) =>
        setActionError(
          error instanceof ApiError
            ? error.message
            : 'Não foi possível concluir a ação. Tente novamente.',
        ),
    });
  };

  const all = query.data ?? [];
  const visible = all.filter((c) => filter === 'ALL' || c.status === filter);
  const busy = Object.values(mutations).some((m) => m.isPending);

  return (
    <section aria-labelledby="congregacoes" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="congregacoes" className="text-lg font-semibold">
            Congregações
          </h2>
          {query.isSuccess && (
            <p className="text-sm text-slate-600">
              {all.length === 1
                ? '1 congregação'
                : `${all.length} congregações`}
            </p>
          )}
        </div>
        {canManage && (
          <Link to="/congregacoes/nova" className={primaryButtonClass}>
            Nova congregação
          </Link>
        )}
      </div>

      <div
        role="group"
        aria-label="Filtrar por situação"
        className="flex flex-wrap gap-2"
      >
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={`h-10 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              filter === option.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {actionError && <ErrorAlert>{actionError}</ErrorAlert>}

      {query.isPending && (
        <p role="status" className="text-sm text-slate-500">
          Carregando congregações…
        </p>
      )}

      {query.isError && (
        <div className={`${cardClass} space-y-3`}>
          <ErrorAlert>
            {query.error instanceof ApiError
              ? query.error.message
              : 'Não foi possível carregar as congregações.'}
          </ErrorAlert>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() => void query.refetch()}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {query.isSuccess && visible.length === 0 && (
        <p className={`${cardClass} text-sm text-slate-600`}>
          {all.length === 0
            ? 'Nenhuma congregação cadastrada ainda.'
            : 'Nenhuma congregação nesta situação.'}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="space-y-3">
          {visible.map((congregation) => (
            <CongregationItem
              key={congregation.id}
              congregation={congregation}
              canManage={canManage}
              busy={busy}
              onDeactivate={() =>
                run(
                  mutations.deactivate.mutate,
                  congregation.id,
                  `Desativar a congregação "${congregation.name}"? Ela deixa de aparecer como ativa, mas nada é apagado.`,
                )
              }
              onReactivate={() =>
                run(mutations.reactivate.mutate, congregation.id)
              }
              onDesignate={() =>
                run(
                  mutations.designateHeadquarters.mutate,
                  congregation.id,
                  `Tornar "${congregation.name}" a sede? A sede atual deixa de ser sede.`,
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CongregationItem({
  congregation,
  canManage,
  busy,
  onDeactivate,
  onReactivate,
  onDesignate,
}: {
  congregation: Congregation;
  canManage: boolean;
  busy: boolean;
  onDeactivate: () => void;
  onReactivate: () => void;
  onDesignate: () => void;
}) {
  const inactive = congregation.status === 'INACTIVE';

  return (
    <li className={cardClass}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{congregation.name}</h3>
        {congregation.isHeadquarters && (
          <span className={`${badge} bg-sky-100 text-sky-800`}>Sede</span>
        )}
        {inactive && (
          <span className={`${badge} bg-slate-100 text-slate-600`}>
            Inativa
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {summarizeAddress(congregation.address)}
      </p>
      {congregation.serviceTimes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-sm text-slate-700">
          {congregation.serviceTimes.map((service) => (
            <li key={`${service.weekday}-${service.time}`}>
              {describeServiceTime(service)}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={`/congregacoes/${congregation.id}/editar`}
            className={smallButtonClass}
          >
            Editar
          </Link>
          {inactive ? (
            <button
              type="button"
              className={smallButtonClass}
              disabled={busy}
              onClick={onReactivate}
            >
              Reativar
            </button>
          ) : (
            <>
              {!congregation.isHeadquarters && (
                <button
                  type="button"
                  className={smallButtonClass}
                  disabled={busy}
                  onClick={onDesignate}
                >
                  Tornar sede
                </button>
              )}
              {!congregation.isHeadquarters && (
                <button
                  type="button"
                  className={smallButtonClass}
                  disabled={busy}
                  onClick={onDeactivate}
                >
                  Desativar
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
