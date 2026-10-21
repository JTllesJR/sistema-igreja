import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type {
  ManualEventType,
  MemberDetail,
  MemberStatus,
} from '@igreja/contracts';
import { ApiError } from '../auth/http';
import { hasPermission } from '../auth/permissions';
import { useSession } from '../auth/SessionProvider';
import { useCongregations } from '../congregations/queries';
import { summarizeAddress } from '../congregations/form';
import {
  ANONYMIZE_CONFIRMATION,
  EVENT_TYPE_LABELS,
  STATUSES,
  STATUS_LABELS,
  describeEvent,
  formatDate,
  formatPhone,
  isAnonymizeConfirmed,
} from '../members/form';
import { useMember, useMemberMutations } from '../members/queries';
import { ErrorAlert, Field } from '../ui/Field';
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallButtonClass,
} from '../ui/styles';

const MANUAL_EVENTS: ManualEventType[] = ['BAPTISM', 'RECEPTION'];

function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Não foi possível concluir a ação. Tente novamente.';
}

export function MembroFichaPage() {
  const { id = '' } = useParams();
  const query = useMember(id);
  const congregations = useCongregations();

  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-slate-500">
        Carregando a ficha…
      </p>
    );
  }
  if (query.isError) {
    return (
      <section className={`${cardClass} space-y-3`}>
        <ErrorAlert>
          {query.error instanceof ApiError && query.error.status === 404
            ? 'Membro não encontrado.'
            : messageOf(query.error)}
        </ErrorAlert>
        <Link to="/membros" className={secondaryButtonClass}>
          Voltar para a lista
        </Link>
      </section>
    );
  }

  const names = new Map((congregations.data ?? []).map((c) => [c.id, c.name]));
  const congregationName = (congregationId: string | null) =>
    (congregationId && names.get(congregationId)) || 'outra congregação';

  return (
    <Ficha
      member={query.data}
      congregationName={congregationName}
      congregationOptions={congregations.data ?? []}
    />
  );
}

function Ficha({
  member,
  congregationName,
  congregationOptions,
}: {
  member: MemberDetail;
  congregationName: (id: string | null) => string;
  congregationOptions: { id: string; name: string; status: string }[];
}) {
  const session = useSession();
  const mutations = useMemberMutations();
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<MemberStatus | ''>('');
  const [destination, setDestination] = useState('');
  const [eventType, setEventType] = useState<ManualEventType>('BAPTISM');
  const [eventDate, setEventDate] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  const fail = (caught: unknown) => setError(messageOf(caught));
  const { canEdit, canAnonymize } = member.capabilities;

  // Só oferece como destino o que a pessoa pode escrever (a API confere de novo e responde 403 se não puder).
  const destinations = congregationOptions.filter(
    (c) =>
      c.status === 'ACTIVE' &&
      c.id !== member.congregationId &&
      session.status === 'authenticated' &&
      hasPermission(session.user, 'members:write', c.id),
  );

  function changeStatus(event: FormEvent) {
    event.preventDefault();
    if (newStatus === '') return;
    setError(null);
    mutations.changeStatus.mutate(
      { id: member.id, request: { status: newStatus } },
      { onSuccess: () => setNewStatus(''), onError: fail },
    );
  }

  function transfer(event: FormEvent) {
    event.preventDefault();
    if (destination === '') return;
    if (
      !window.confirm(
        `Transferir ${member.fullName} para ${congregationName(destination)}?`,
      )
    )
      return;
    setError(null);
    mutations.transfer.mutate(
      { id: member.id, request: { congregationId: destination } },
      { onSuccess: () => setDestination(''), onError: fail },
    );
  }

  function recordEvent(event: FormEvent) {
    event.preventDefault();
    if (eventDate === '') {
      setError('Informe a data em que o fato ocorreu.');
      return;
    }
    setError(null);
    mutations.recordEvent.mutate(
      {
        id: member.id,
        request: {
          type: eventType,
          occurredOn: eventDate,
          notes: eventNotes.trim() === '' ? null : eventNotes.trim(),
        },
      },
      {
        onSuccess: () => {
          setEventDate('');
          setEventNotes('');
        },
        onError: fail,
      },
    );
  }

  function anonymize() {
    if (!isAnonymizeConfirmed(typed)) return;
    setError(null);
    mutations.anonymize.mutate(member.id, {
      onSuccess: () => {
        setConfirming(false);
        setTyped('');
      },
      onError: fail,
    });
  }

  const busy = Object.values(mutations).some((m) => m.isPending);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{member.fullName}</h2>
          <p className="text-sm text-slate-600">
            {congregationName(member.congregationId)} ·{' '}
            {STATUS_LABELS[member.status]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/membros" className={secondaryButtonClass}>
            Voltar
          </Link>
          {canEdit && (
            <Link
              to={`/membros/${member.id}/editar`}
              className={primaryButtonClass}
            >
              Editar
            </Link>
          )}
        </div>
      </div>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Dados sensíveis. Seu acesso a esta ficha foi registrado.
      </p>

      {member.anonymized && (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Os dados pessoais deste membro foram apagados (anonimizados) e não
          podem mais ser alterados.
        </p>
      )}
      {error && <ErrorAlert>{error}</ErrorAlert>}

      <section aria-labelledby="dados" className={cardClass}>
        <h3 id="dados" className="font-semibold">
          Dados
        </h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Nascimento" value={formatDate(member.birthDate)} />
          <Item label="Telefone" value={formatPhone(member.phone)} />
          <Item label="E-mail" value={member.email ?? '—'} />
          <Item label="Endereço" value={summarizeAddress(member.address)} />
        </dl>
      </section>

      {canEdit && (
        <section aria-labelledby="acoes" className={`${cardClass} space-y-5`}>
          <h3 id="acoes" className="font-semibold">
            Ações
          </h3>

          <form
            onSubmit={changeStatus}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="min-w-48 flex-1">
              <Field id="nova-situacao" label="Mudar a situação">
                {(props) => (
                  <select
                    {...props}
                    value={newStatus}
                    onChange={(e) =>
                      setNewStatus(e.target.value as MemberStatus | '')
                    }
                    className={fieldClass}
                  >
                    <option value="">Escolher</option>
                    {STATUSES.filter((s) => s !== member.status).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <button
              type="submit"
              className={secondaryButtonClass}
              disabled={busy || newStatus === ''}
            >
              Mudar situação
            </button>
          </form>

          {destinations.length > 0 && (
            <form
              onSubmit={transfer}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="min-w-48 flex-1">
                <Field id="destino" label="Transferir para outra congregação">
                  {(props) => (
                    <select
                      {...props}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Escolher</option>
                      {destinations.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              <button
                type="submit"
                className={secondaryButtonClass}
                disabled={busy || destination === ''}
              >
                Transferir
              </button>
            </form>
          )}

          <form onSubmit={recordEvent} className="space-y-3">
            <p className="text-sm font-medium">Registrar um fato na história</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="tipo-fato" label="Tipo">
                {(props) => (
                  <select
                    {...props}
                    value={eventType}
                    onChange={(e) =>
                      setEventType(e.target.value as ManualEventType)
                    }
                    className={fieldClass}
                  >
                    {MANUAL_EVENTS.map((type) => (
                      <option key={type} value={type}>
                        {EVENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field id="data-fato" label="Data em que ocorreu">
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className={fieldClass}
                  />
                )}
              </Field>
            </div>
            <Field id="obs-fato" label="Observação (opcional)">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  maxLength={500}
                  value={eventNotes}
                  onChange={(e) => setEventNotes(e.target.value)}
                  className={fieldClass}
                />
              )}
            </Field>
            <button
              type="submit"
              className={secondaryButtonClass}
              disabled={busy}
            >
              Registrar
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="historia" className={cardClass}>
        <h3 id="historia" className="font-semibold">
          História
        </h3>
        <ol className="mt-3 space-y-3">
          {member.history.map((event) => (
            <li key={event.id} className="text-sm">
              <p className="font-medium">
                {describeEvent(event, congregationName)}
              </p>
              <p className="text-slate-600">
                {formatDate(event.occurredOn)}
                {event.notes ? ` · ${event.notes}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {canAnonymize && (
        <section
          aria-labelledby="anonimizar"
          className={`${cardClass} space-y-3 border-red-200`}
        >
          <h3 id="anonimizar" className="font-semibold text-red-800">
            Apagar os dados pessoais (LGPD)
          </h3>
          <p className="text-sm text-slate-700">
            Apaga nome, nascimento, telefone, e-mail, endereço e observações. A
            pessoa deixa de aparecer nas listas. A congregação e a situação
            ficam, para as contas da igreja continuarem fechando.{' '}
            <strong>Isto não pode ser desfeito.</strong>
          </p>
          {!confirming ? (
            <button
              type="button"
              className={smallButtonClass}
              onClick={() => setConfirming(true)}
            >
              Apagar os dados pessoais…
            </button>
          ) : (
            <div className="space-y-3">
              <Field
                id="confirmar"
                label={`Para confirmar, digite ${ANONYMIZE_CONFIRMATION}`}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    className={fieldClass}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-red-700 px-4 text-base font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy || !isAnonymizeConfirmed(typed)}
                  onClick={anonymize}
                >
                  Apagar definitivamente
                </button>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => {
                    setConfirming(false);
                    setTyped('');
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
