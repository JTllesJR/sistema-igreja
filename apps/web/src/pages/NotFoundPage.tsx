import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Página não encontrada</h2>
      <p className="mt-2 text-sm text-slate-600">
        O endereço que você abriu não existe.
      </p>
      <Link
        to="/"
        className="mt-4 inline-block text-sm font-medium text-slate-900 underline"
      >
        Voltar ao início
      </Link>
    </section>
  );
}
