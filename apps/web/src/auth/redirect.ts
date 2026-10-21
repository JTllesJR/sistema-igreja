/**
 * Para onde voltar depois de entrar. Só aceita caminho DENTRO do próprio site: `//evil.com` ou `https://evil.com`
 * transformariam a tela de login num redirecionamento aberto (phishing com a nossa cara).
 */
export function safeRedirect(value: unknown, fallback = '/conta'): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}
