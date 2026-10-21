/**
 * Porta para gerar identificadores. O domínio não gera ids (precisa deles prontos para criar o agregado);
 * quem gera é a infraestrutura (UUID v7), e os testes usam uma versão previsível.
 */
export interface IdGenerator {
  /** Devolve um novo identificador (UUID) a cada chamada. */
  next(): string;
}
