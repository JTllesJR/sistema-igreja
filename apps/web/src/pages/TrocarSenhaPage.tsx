import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useApis } from '../api/context';
import { ApiError } from '../auth/http';
import { useSession, useSessionManager } from '../auth/SessionProvider';
import type { FieldErrors } from '../congregations/form';
import {
  emptyPasswordChangeForm,
  validatePasswordChange,
} from '../users/logic';
import { ErrorAlert, Field } from '../ui/Field';
import { cardClass, fieldClass, primaryButtonClass } from '../ui/styles';

/**
 * Troca da PRÓPRIA senha. É também o destino obrigatório de quem entrou com senha temporária: até trocar, a API recusa
 * todo o resto (ADR 0014). As senhas vivem só no estado desta tela e são apagadas ao enviar.
 */
export function TrocarSenhaPage() {
  const { account } = useApis();
  const sessionManager = useSessionManager();
  const session = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyPasswordChangeForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const forced =
    session.status === 'authenticated' && session.user.mustChangePassword;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSummary(null);

    const found = validatePasswordChange(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    try {
      await account.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // Apaga as senhas da memória da tela antes de qualquer outra coisa.
      setForm(emptyPasswordChangeForm());
      await sessionManager.reloadUser();
      void navigate('/', { replace: true });
    } catch (error) {
      setForm((f) => ({ ...f, newPassword: '', confirmation: '' }));
      setSummary(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível trocar a senha. Tente novamente.',
      );
      setPending(false);
    }
  }

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <section
      aria-labelledby="trocar-senha"
      className={`${cardClass} mx-auto max-w-md sm:p-6`}
    >
      <h2 id="trocar-senha" className="text-lg font-semibold">
        {forced ? 'Escolha a sua senha' : 'Trocar a senha'}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {forced
          ? 'Você entrou com uma senha temporária. Escolha uma senha só sua para continuar.'
          : 'Ao trocar, os outros aparelhos em que você está logado são desconectados.'}
      </p>

      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="mt-5 space-y-4"
      >
        {summary && <ErrorAlert>{summary}</ErrorAlert>}

        <Field
          id="senha-atual"
          label={forced ? 'Senha temporária' : 'Senha atual'}
          error={errors['currentPassword']}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => set('currentPassword', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field
          id="senha-nova"
          label="Nova senha"
          hint="De 10 a 128 caracteres. Uma frase longa funciona melhor que símbolos."
          error={errors['newPassword']}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(e) => set('newPassword', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>
        <Field
          id="senha-confirmacao"
          label="Repita a nova senha"
          error={errors['confirmation']}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              autoComplete="new-password"
              value={form.confirmation}
              onChange={(e) => set('confirmation', e.target.value)}
              className={fieldClass}
            />
          )}
        </Field>

        <button
          type="submit"
          disabled={pending}
          className={`${primaryButtonClass} w-full`}
        >
          {pending ? 'Salvando…' : 'Trocar a senha'}
        </button>
      </form>
    </section>
  );
}
