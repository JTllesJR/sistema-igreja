import { StringDecoder } from 'node:string_decoder';

/** O usuário desistiu (Ctrl+C ou Ctrl+D) durante o prompt. */
export class PromptCancelledError extends Error {
  constructor() {
    super('Operação cancelada.');
    this.name = 'PromptCancelledError';
  }
}

/** Pediram um prompt, mas a entrada não é um terminal (ex.: está num pipe ou no CI). */
export class NotInteractiveError extends Error {
  constructor() {
    super('A entrada não é um terminal interativo.');
    this.name = 'NotInteractiveError';
  }
}

/** O que o prompt precisa da entrada: um fluxo de leitura que, num terminal de verdade, também tem `isTTY` e modo raw. */
export interface TerminalInput extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode?(mode: boolean): unknown;
}

export interface TerminalOutput {
  write(text: string): unknown;
}

const ESC = '\u001b';

/**
 * Lê uma linha SEM eco (senha). Num terminal normal, o próprio terminal escreve cada tecla de volta; aqui ligamos o
 * modo "raw", em que o Node recebe as teclas e nada é mostrado, e tratamos Enter, Backspace e Ctrl+C à mão.
 *
 * - Só o rótulo e a quebra de linha final vão para a tela: nada do que foi digitado é escrito de volta.
 * - Backspace apaga um caractere inteiro (ponto de código), inclusive emoji.
 * - Setas, Delete e outras sequências de escape são ignoradas, não viram parte da senha.
 * - O modo raw é sempre desligado e a entrada pausada ao terminar, inclusive ao cancelar.
 */
export function readHiddenLine(
  input: TerminalInput,
  output: TerminalOutput,
  label: string,
): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(new NotInteractiveError());
  }
  const setRawMode = input.setRawMode.bind(input);

  return new Promise((resolve, reject) => {
    const typed: string[] = []; // um item por ponto de código
    let escape: 'none' | 'esc' | 'csi' = 'none';

    const finish = (settle: () => void): void => {
      input.off('data', onData);
      setRawMode(false);
      input.pause();
      settle();
    };

    const onData = (chunk: string | Buffer): void => {
      for (const char of String(chunk)) {
        // Sequências de escape (setas etc.): ESC, depois "[", parâmetros e um byte final entre "@" e "~".
        if (escape === 'esc') {
          escape = char === '[' ? 'csi' : 'none';
          continue;
        }
        if (escape === 'csi') {
          if (char >= '@' && char <= '~') escape = 'none';
          continue;
        }
        if (char === ESC) {
          escape = 'esc';
          continue;
        }

        if (char === '\r' || char === '\n') {
          output.write('\n');
          return finish(() => resolve(typed.join('')));
        }
        if (char === '\u0003' || char === '\u0004') {
          output.write('\n');
          return finish(() => reject(new PromptCancelledError()));
        }
        if (char === '\u007f' || char === '\b') {
          typed.pop();
          continue;
        }
        if (char < ' ') continue; // Tab e demais teclas de controle

        typed.push(char);
      }
    };

    output.write(label);
    input.setEncoding('utf8');
    setRawMode(true);
    input.on('data', onData);
    input.resume();
  });
}

/**
 * Lê o texto inteiro da entrada padrão (senha enviada por pipe, `--password-stdin`) e remove UMA quebra de linha
 * final, a que o `echo` e o Enter acrescentam. Espaços nas pontas são preservados: fazem parte da senha.
 */
export async function readAllText(
  input: NodeJS.ReadableStream,
  maxLength = 4096,
): Promise<string> {
  const decoder = new StringDecoder('utf8'); // junta caracteres UTF-8 partidos entre dois pedaços
  let text = '';

  for await (const chunk of input) {
    text += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    if (text.length > maxLength) throw new Error('Entrada grande demais.');
  }
  text += decoder.end();

  return text.replace(/\r?\n$/, '');
}
