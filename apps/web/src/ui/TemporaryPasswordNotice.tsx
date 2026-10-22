import { useState } from 'react';
import { primaryButtonClass, secondaryButtonClass } from './styles';

/**
 * Mostra a senha temporária UMA vez. SEGURANÇA: a senha só existe no estado desta tela (nunca em cache, URL nem
 * armazenamento); ao clicar em "Já anotei" quem a mostra a descarta, e ela não pode ser recuperada de novo (só redefinida).
 */
export function TemporaryPasswordNotice({
  email,
  password,
  onDone,
}: {
  email: string;
  password: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState<'sim' | 'falhou' | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied('sim');
    } catch {
      // Sem permissão de área de transferência (ou fora de HTTPS): a pessoa copia à mão.
      setCopied('falhou');
    }
  }

  return (
    <section
      aria-labelledby="senha-temporaria"
      className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5"
    >
      <h3 id="senha-temporaria" className="font-semibold text-amber-950">
        Senha temporária de {email}
      </h3>
      <p className="text-sm text-amber-950">
        Esta senha aparece <strong>só agora</strong> e não poderá ser vista de
        novo (se perder, é preciso redefinir). Entregue-a só à própria pessoa;
        ela será obrigada a trocá-la no primeiro acesso.
      </p>
      <p
        aria-label="Senha temporária"
        className="select-all break-all rounded-lg border border-amber-300 bg-white px-3 py-3 font-mono text-lg tracking-wide text-slate-900"
      >
        {password}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => void copy()}
        >
          Copiar
        </button>
        <button type="button" className={primaryButtonClass} onClick={onDone}>
          Já anotei
        </button>
        {copied === 'sim' && (
          <span role="status" className="text-sm text-amber-950">
            Copiada.
          </span>
        )}
        {copied === 'falhou' && (
          <span role="status" className="text-sm text-amber-950">
            Não foi possível copiar: selecione e copie à mão.
          </span>
        )}
      </div>
    </section>
  );
}
