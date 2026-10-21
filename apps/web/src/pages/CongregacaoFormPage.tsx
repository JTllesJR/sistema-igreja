import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../auth/http';
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  describeApiError,
  emptyForm,
  fromCongregation,
  newServiceTime,
  toRequest,
  validateForm,
  type AddressForm,
  type CongregationForm,
  type FieldErrors,
  type ServiceTimeForm,
} from '../congregations/form';
import {
  useCongregationMutations,
  useCongregations,
} from '../congregations/queries';
import { AddressFields } from '../ui/AddressFields';
import { ErrorAlert, Field } from '../ui/Field';
import {
  cardClass,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
  smallButtonClass,
} from '../ui/styles';

/** Cadastro (`/congregacoes/nova`) e edição (`/congregacoes/:id/editar`) usam o mesmo formulário. */
export function CongregacaoFormPage() {
  const { id } = useParams();
  const query = useCongregations();

  if (id === undefined) return <CongregationFormView initial={emptyForm()} />;

  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-slate-500">
        Carregando…
      </p>
    );
  }
  const congregation = query.data?.find((c) => c.id === id);
  if (!congregation) {
    return (
      <section className={cardClass}>
        <h2 className="text-lg font-semibold">Congregação não encontrada</h2>
        <Link
          to="/congregacoes"
          className="mt-3 inline-block text-sm font-medium underline"
        >
          Voltar para a lista
        </Link>
      </section>
    );
  }
  // `key` recria o formulário se o usuário trocar de congregação sem sair da página.
  return (
    <CongregationFormView
      key={congregation.id}
      congregationId={congregation.id}
      initial={fromCongregation(congregation)}
    />
  );
}

function CongregationFormView({
  congregationId,
  initial,
}: {
  congregationId?: string;
  initial: CongregationForm;
}) {
  const navigate = useNavigate();
  const mutations = useCongregationMutations();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState<string | null>(null);

  const editing = congregationId !== undefined;
  const pending = mutations.create.isPending || mutations.update.isPending;

  const setAddress = (field: keyof AddressForm, value: string) =>
    setForm((f) => ({ ...f, address: { ...f.address, [field]: value } }));
  const setService = (index: number, patch: Partial<ServiceTimeForm>) =>
    setForm((f) => ({
      ...f,
      serviceTimes: f.serviceTimes.map((s, i) =>
        i === index ? { ...s, ...patch } : s,
      ),
    }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setSummary(null);

    const found = validateForm(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSummary('Corrija os campos destacados e tente de novo.');
      return;
    }

    const request = toRequest(form);
    const options = {
      onSuccess: () => void navigate('/congregacoes'),
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
      mutations.update.mutate({ id: congregationId, request }, options);
    } else {
      mutations.create.mutate(request, options);
    }
  }

  return (
    <section
      aria-labelledby="titulo"
      className={`${cardClass} mx-auto max-w-2xl sm:p-6`}
    >
      <h2 id="titulo" className="text-lg font-semibold">
        {editing ? 'Editar congregação' : 'Nova congregação'}
      </h2>

      <form
        onSubmit={submit}
        noValidate
        className="mt-5 space-y-6"
        aria-label={editing ? 'Editar congregação' : 'Nova congregação'}
      >
        {summary && <ErrorAlert>{summary}</ErrorAlert>}

        <Field id="name" label="Nome" error={errors['name']}>
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={fieldClass}
            />
          )}
        </Field>

        <AddressFields
          address={form.address}
          errors={errors}
          onChange={setAddress}
        />

        <fieldset className="space-y-4">
          <legend className="text-base font-semibold">Horários de culto</legend>
          {form.serviceTimes.length === 0 && (
            <p className="text-sm text-slate-600">Nenhum horário informado.</p>
          )}
          {form.serviceTimes.map((service, index) => (
            <div
              key={index}
              className="space-y-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                <Field id={`weekday-${index}`} label="Dia da semana">
                  {(props) => (
                    <select
                      {...props}
                      value={service.weekday}
                      onChange={(e) =>
                        setService(index, {
                          weekday: e.target.value as ServiceTimeForm['weekday'],
                        })
                      }
                      className={fieldClass}
                    >
                      {WEEKDAYS.map((day) => (
                        <option key={day} value={day}>
                          {WEEKDAY_LABELS[day]}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field
                  id={`time-${index}`}
                  label="Horário"
                  error={errors[`serviceTimes.${index}.time`]}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="time"
                      value={service.time}
                      onChange={(e) =>
                        setService(index, { time: e.target.value })
                      }
                      className={fieldClass}
                    />
                  )}
                </Field>
              </div>
              <Field
                id={`service-name-${index}`}
                label="Nome do culto"
                error={errors[`serviceTimes.${index}.name`]}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    value={service.name}
                    onChange={(e) =>
                      setService(index, { name: e.target.value })
                    }
                    className={fieldClass}
                  />
                )}
              </Field>
              <button
                type="button"
                className={smallButtonClass}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    serviceTimes: f.serviceTimes.filter((_, i) => i !== index),
                  }))
                }
              >
                Remover este horário
              </button>
            </div>
          ))}
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              setForm((f) => ({
                ...f,
                serviceTimes: [...f.serviceTimes, newServiceTime()],
              }))
            }
          >
            Adicionar horário
          </button>
        </fieldset>

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
          <Link to="/congregacoes" className={secondaryButtonClass}>
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
