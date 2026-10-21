/**
 * Devolve o erro lançado por `fn` (ou `undefined` se nada foi lançado).
 * Permite inspecionar propriedades do erro (ex.: `field`, `code`) sem depender do texto da mensagem,
 * que é voltado ao usuário e pode mudar sem quebrar o comportamento.
 */
export function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
