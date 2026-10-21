import type { SessionManager } from './session';

/**
 * Esvazia o cache de dados quando a sessão acaba. SEGURANÇA: os dados de membros ficam na memória da página (cache do
 * TanStack Query); sem isto, depois de sair, quem usasse o mesmo navegador poderia vê-los (voltando uma tela, por exemplo)
 * ou, pior, uma pessoa de OUTRA igreja que entrasse em seguida veria um instante de dados da anterior.
 *
 * Devolve a função que desfaz a assinatura.
 */
export function clearCacheOnLogout(
  session: Pick<SessionManager, 'subscribe' | 'getState'>,
  cache: { clear(): void },
): () => void {
  return session.subscribe(() => {
    if (session.getState().status === 'anonymous') cache.clear();
  });
}
