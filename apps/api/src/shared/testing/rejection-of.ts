/**
 * Devolve o erro com que uma operação assíncrona foi rejeitada (ou `undefined` se ela deu certo).
 * Permite inspecionar a classe e as propriedades do erro sem depender do texto da mensagem.
 */
export async function rejectionOf(
  fn: () => Promise<unknown>,
): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
