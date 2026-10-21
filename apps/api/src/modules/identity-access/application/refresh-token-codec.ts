/**
 * Porta para o token de renovação: valor aleatório entregue ao cliente e seu hash, que é o único que fica guardado.
 * Se o banco vazar, os hashes não permitem renovar nenhuma sessão.
 */
export interface RefreshTokenCodec {
  /** Gera um token novo (aleatório, 256 bits) e o hash correspondente. */
  generate(): { token: string; hash: string };

  /** Hash determinístico de um token recebido do cliente, para localizar a sessão. */
  hashOf(token: string): string;
}
