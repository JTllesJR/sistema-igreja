/** Saída de um comando de linha, separada do `console` para poder ser testada. */
export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}
