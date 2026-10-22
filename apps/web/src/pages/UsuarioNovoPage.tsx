import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../auth/http';
import { describeApiError, type FieldErrors } from '../congregations/form';
import { useCongregations } from '../congregations/queries';
import { TemporaryPasswordNotice } from '../ui/TemporaryPasswordNotice';
import { ErrorAlert, Field } from '../ui/Field';
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../ui/styles';
import {
  emptyCreateUserForm,
  isWholeChurchOnly,
  toCreateRequest,
  validateCreateUser,
} from '../users/logic';
import { useRoles, useUserMutations } from '../users/queries';

export function UsuarioNovoPage() {
  const roles = useRoles();
  const congregations = useCongregations();
  const mutations = useUserMutations();
  const [form, setForm] = useState(emptyCreateUserForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState<string | null>(null);
  // A senha temporária vive SÓ aqui, no estado da tela: nunca em cache (a mutação usa gcTime 0), URL nem armazenamento.
  const [created, setCreated] = useState<{
    email: string;
    password: string;
  } | null>(null);

  const roleList = roles.data ?? [];
  const selected = roleList.find((r) => r.id === form.roleId);
  const needsCongregation =
    selected !== undefined && !isWholeChurchOnly(selected);
  const activeCongregations = (congregations.data ?? []).filter(
    (c) => c.status === 'ACTIVE',
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSummary(null);

    const found = validateCreateUser(form, roleList);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSummary('Corrija os campos destacados e tente de novo.');
      return;
    }

    try {
      const result = await mutations.create.mutateAsync(
        toCreateRequest(form, roleList),
      );
      setCreated({
        email: result.user.email,
        password: result.temporaryPassword,
      });
      setForm(emptyCreateUserForm());
    } catch (error) {
      if (error instanceof ApiError) {
        const described = describeApiError(error);
        setSummary(described.summary);
        setErrors(described.fields);
      } else {
        setSummary('Não foi possível cadastrar. Tente novamente.');
      }
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <TemporaryPasswordNotice
          email={created.email}
          password={created.password}
          onDone={() => setCreated(null)}
        />
        <Link to="/usuarios" className={secondaryButtonClass}>
          Voltar para a lista
        </Link>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="titulo"
      className={`${cardClass} mx-auto max-w-2xl sm:p-6`}
    >
      <h2 id="titulo" className="text-lg font-semibold">
        Novo usuário
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        O sistema gera uma senha temporária, que você verá uma única vez. A
        pessoa será obrigada a trocá-la ao entrar.
      </p>

      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="mt-5 space-y-5"
      >
        {summary && <ErrorAlert>{summary}</ErrorAlert>}

        <Field id="email" label="E-mail" error={errors['email']}>
          {(props) => (
            <input
              {...props}
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={fieldClass}
            />
          )}
        </Field>

        <Field id="papel" label="Papel" error={errors['roleId']}>
          {(props) => (
            <select
              {...props}
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
              className={fieldClass}
            >
              <option value="">Escolher</option>
              {roleList.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        {needsCongregation && (
          <Field
            id="congregacao"
            label="Congregação"
            error={errors['congregationId']}
          >
            {(props) => (
              <select
                {...props}
                value={form.congregationId}
                onChange={(e) =>
                  setForm({ ...form, congregationId: e.target.value })
                }
                className={fieldClass}
              >
                <option value="">Escolher</option>
                {activeCongregations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {selected && !needsCongregation && (
          <p className="text-sm text-slate-600">
            O papel {selected.name} vale para a igreja toda.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={mutations.create.isPending}
            className={primaryButtonClass}
          >
            {mutations.create.isPending ? 'Cadastrando…' : 'Cadastrar'}
          </button>
          <Link to="/usuarios" className={secondaryButtonClass}>
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
