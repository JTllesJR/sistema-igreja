/** Classes compartilhadas, conforme o DESIGN.md (campos e botões de 44px, foco visível, sem sombra). */

export const fieldClass =
  'mt-1 block h-11 w-full rounded-lg border border-slate-400 bg-white px-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-900 aria-[invalid=true]:border-red-600';

const buttonBase =
  'inline-flex h-11 items-center justify-center rounded-lg px-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60';

export const primaryButtonClass = `${buttonBase} bg-slate-900 text-white hover:bg-slate-800`;

export const secondaryButtonClass = `${buttonBase} border border-slate-400 bg-white text-slate-900 hover:bg-slate-50`;

/** Botão menor para ações dentro de listas (continua com alvo de toque de 40px). */
export const smallButtonClass =
  'inline-flex h-10 items-center justify-center rounded-lg border border-slate-400 bg-white px-3 text-sm font-medium text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60';

export const cardClass = 'rounded-xl border border-slate-200 bg-white p-5';
