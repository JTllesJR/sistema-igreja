import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../auth/http';
import { hasPermission } from '../auth/permissions';
import { useSession } from '../auth/SessionProvider';
import {
  describeApiError,
  type AddressForm,
  type FieldErrors,
} from '../congregations/form';
import { useCongregations } from '../congregations/queries';
import {
  emptyMemberForm,
  fromMember,
  toCreateRequest,
  toUpdateRequest,
  validateMemberForm,
  type MemberForm,
} from '../members/form';
import { useMember, useMemberMutations } from '../members/queries';
import { AddressFields } from '../ui/AddressFields';
import { ErrorAlert, Field } from '../ui/Field';
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui/styles';

/** Cadastro (`/membros/novo`) e edição (`/membros/:id/editar`) usam o mesmo formulário. */
export function MembroFormPage() {
  const { id } = useParams();
  return id === undefined ? (
    <MemberFormView initial={emptyMemberForm()} />
  ) : (
    <EditLoader id={id} />
  );
}

function EditLoader({ id }: { id: string }) {
  const query = useMember(id);

  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-slate-500">
        Carregando…
      </p>
    );
  }
  if (query.isError || !query.data.capabilities.canEdit) {
    return (
      <section className={`${cardClass} space-y-3`}>
        <ErrorAlert>
          {query.isError && query.error instanceof ApiError
            ? query.error.message
            : 'Você não pode editar este membro.'}
        </ErrorAlert>
        <Link to="/membros" className={secondaryButtonClass}>
          Voltar para a lista
        </Link>
      </section>
    );
  }
  return (
    <MemberFormView
      key={query.data.id}
      memberId={query.data.id}
      initial={fromMember(query.data)}
    />
  );
}

function MemberFormView({
  memberId,
  initial,
}: {
  memberId?: string;
  initial: MemberForm;
}) {
  const navigate = useNavigate();
  const session = useSession();
  const congregations = useCongregations();
  const mutations = useMemberMutations();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState<string | null>(null);

  const editing = memberId !== undefined;
  const pending = mutations.create.isPending || mutations.update.isPending;

  // No cadastro, só se oferece onde a pessoa pode escrever (a API confere de novo).
  const writable = (congregations.data ?? []).filter(
    (c) =>
      c.status === 'ACTIVE' &&
      session.status === 'authenticated' &&
      hasPermission(session.user, 'members:write', c.id),
  );

  const set = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setAddress = (field: keyof AddressForm, value: string) =>
    setForm((f) => ({ ...f, address: { ...f.address, [field]: value } }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setSummary(null);

    const found = validateMemberForm(form, { requireCongregation: !editing });
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSummary('Corrija os campos destacados e tente de novo.');
      return;
    }

    const options = {
      onError: (error: unknown) => {
        if (error instanceof ApiError) {
          const described = describeApiError(error);
          setSummary(described.summary);
          setErrors(described.fields);
        } else {
          setSummary('Não foi possível salvar. Tente novamente.');
        }
      },
    };
    if (editing) {
      mutations.update.mutate(
        { id: memberId, request: toUpdateRequest(form) },
        { ...options, onSuccess: () => void navigate(`/membros/${memberId}`) },
      );
    } else {
      mutations.create.mutate(toCreateRequest(form), {
        ...options,
        onSuccess: (created) => void navigate(`/membros/${created.id}`),
      });
    }
  }

  return (
    <section
      aria-labelledby="titulo"
      className={`${cardClass} mx-auto max-w-2xl sm:p-6`}
    >
      <h2 id="titulo" className="text-lg font-semibold">
        {editing ? 'Editar membro' : 'Novo membro'}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Dados sensíveis: peça e guarde só o que a igreja realmente precisa.
      </p>

      <form onSubmit={submit} noValidate className="mt-5 space-y-6">
        {summary && <ErrorAlert>{summary}</ErrorAlert>}

        {!editing && (
          <Field
            id="congregacao"
            label="Congregação"
            error={errors['congregationId']}
          >
            {(props) => (
              <select
                {...props}
                value={form.congregationId}
                onChange={(e) => set('congregationId', e.target.value)}
                className={fieldClass}
              >
                <option value="">Escolher</option>
                {writable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <Field id="nome" label="Nome completo" error={errors['fullName']}>
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              value={form.fullName}
              onChange={(e) => set('fullName', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="nascimento"
            label="Data de nascimento"
            error={errors['birthDate']}
          >
            {(props) => (
              <input
                {...props}
                type="date"
                value={form.birthDate}
                onChange={(e) => set('birthDate', e.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
          <Field id="telefone" label="Telefone" error={errors['phone']}>
            {(props) => (
              <input
                {...props}
                type="tel"
                autoComplete="off"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className={fieldClass}
              />
            )}
          </Field>
        </div>

        <Field id="email" label="E-mail" error={errors['email']}>
          {(props) => (
            <input
              {...props}
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>

        <AddressFields
          address={form.address}
          errors={errors}
          onChange={setAddress}
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className={primaryButtonClass}
          >
            {pending
              ? 'Salvando…'
              : editing
                ? 'Salvar alterações'
                : 'Cadastrar'}
          </button>
          <Link
            to={editing ? `/membros/${memberId}` : '/membros'}
            className={secondaryButtonClass}
          >
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
