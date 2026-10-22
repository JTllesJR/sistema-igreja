import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError } from '../auth/client';
import { safeRedirect } from '../auth/redirect';
import { useSession, useSessionManager } from '../auth/SessionProvider';

const inputClass =
  'mt-1 block h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-900';

export function LoginPage() {
  const sessionManager = useSessionManager();
  const session = useSession();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = safeRedirect(
    (location.state as { from?: unknown } | null)?.from,
  );
  if (session.status === 'authenticated') {
    // Com senha temporária, o único destino possível é a troca da senha.
    return (
      <Navigate
        to={session.user.mustChangePassword ? '/trocar-senha' : destination}
        replace
      />
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await sessionManager.login(email.trim(), password);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Não foi possível entrar. Tente novamente.',
      );
      setPending(false);
    }
  }

  return (
    <section
      aria-labelledby="entrar"
      className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h2 id="entrar" className="text-lg font-semibold">
        Entrar
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Use o e-mail e a senha cadastrados na sua igreja.
      </p>

      <form
        onSubmit={(event) => void submit(event)}
        className="mt-5 space-y-4"
        noValidate
      >
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Senha
          </label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={pending || email.trim() === '' || password === ''}
          className="h-11 w-full rounded-lg bg-slate-900 px-4 text-base font-medium text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </section>
  );
}
