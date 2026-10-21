/**
 * Porta para o relógio. O domínio nunca lê a hora (recebe `now` por parâmetro); quem precisa dela
 * na camada de aplicação usa esta porta, o que torna expiração e bloqueio testáveis sem esperar tempo real.
 */
export interface Clock {
  now(): Date;
}
