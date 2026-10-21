import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { MemberStatus } from '@igreja/contracts';
import { ApiError } from '../auth/http';
import { hasPermissionAnywhere } from '../auth/permissions';
import { useSession } from '../auth/SessionProvider';
import { useCongregations } from '../congregations/queries';
import { STATUS_LABELS, STATUSES } from '../members/form';
import { useMemberList } from '../members/queries';
import { ErrorAlert, Field } from '../ui/Field';
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallButtonClass,
} from '../ui/styles';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;

export function MembrosPage() {
  const session = useSession();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MemberStatus | ''>('');
  const [congregationId, setCongregationId] = useState('');
  const [offset, setOffset] = useState(0);

  // Cada consulta é registrada na trilha de auditoria: espera a pessoa parar de digitar antes de buscar.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchText.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchText]);

  const query = useMemberList({
    ...(search === '' ? {} : { search }),
    ...(status === '' ? {} : { status }),
    ...(congregationId === '' ? {} : { congregationId }),
    limit: PAGE_SIZE,
    offset,
  });
  // Os nomes das congregações são um complemento: sem permissão de lê-las, a lista continua funcionando.
  const congregations = useCongregations();

  const names = new Map((congregations.data ?? []).map((c) => [c.id, c.name]));
  const canWrite =
    session.status === 'authenticated' &&
    hasPermissionAnywhere(session.user, 'members:write');

  const page = query.data;
  const total = page?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <section aria-labelledby="membros" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="membros" className="text-lg font-semibold">
            Membros
          </h2>
          <p className="text-sm text-slate-600">
            Dados sensíveis: seu acesso a esta lista fica registrado.
          </p>
        </div>
        {canWrite && (
          <Link to="/membros/novo" className={primaryButtonClass}>
            Novo membro
          </Link>
        )}
      </div>

      <div className={`${cardClass} grid gap-4 sm:grid-cols-3`}>
        <Field id="busca" label="Buscar pelo nome">
          {(props) => (
            <input
              {...props}
              type="search"
              autoComplete="off"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field id="situacao" label="Situação">
          {(props) => (
            <select
              {...props}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as MemberStatus | '');
                setOffset(0);
              }}
              className={fieldClass}
            >
              <option value="">Todas</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {(congregations.data?.length ?? 0) > 0 && (
          <Field id="congregacao" label="Congregação">
            {(props) => (
              <select
                {...props}
                value={congregationId}
                onChange={(e) => {
                  setCongregationId(e.target.value);
                  setOffset(0);
                }}
                className={fieldClass}
              >
                <option value="">Todas</option>
                {congregations.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
      </div>

      {query.isError && (
        <div className={`${cardClass} space-y-3`}>
          <ErrorAlert>
            {query.error instanceof ApiError
              ? query.error.message
              : 'Não foi possível carregar os membros.'}
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

      {query.isPending && (
        <p role="status" className="text-sm text-slate-500">
          Carregando membros…
        </p>
      )}

      {page && page.items.length === 0 && (
        <p className={`${cardClass} text-sm text-slate-600`}>
          {search !== '' || status !== '' || congregationId !== ''
            ? 'Nenhum membro encontrado com esses filtros.'
            : 'Nenhum membro cadastrado ainda.'}
        </p>
      )}

      {page && page.items.length > 0 && (
        <>
          <ul className="space-y-2" aria-label="Lista de membros">
            {page.items.map((member) => (
              <li key={member.id}>
                <Link
                  to={`/membros/${member.id}`}
                  className={`${cardClass} flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900`}
                >
                  <span>
                    <span className="block font-medium">{member.fullName}</span>
                    <span className="block text-sm text-slate-600">
                      {names.get(member.congregationId) ?? 'Congregação'}
                    </span>
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      member.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {STATUS_LABELS[member.status]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <nav
            aria-label="Páginas"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-slate-600">
              {from} a {to} de {total}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={smallButtonClass}
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Anterior
              </button>
              <button
                type="button"
                className={smallButtonClass}
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Próxima
              </button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
