import { PassThrough, Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  NotInteractiveError,
  PromptCancelledError,
  readAllText,
  readHiddenLine,
} from './terminal-input.js';

/** Um "terminal" falso: um fluxo marcado como TTY que registra as chamadas a setRawMode e o que foi escrito na tela. */
function fakeTerminal(isTTY = true) {
  const input = Object.assign(new PassThrough(), {
    isTTY,
    setRawMode: vi.fn(),
  });
  const written: string[] = [];
  const output = {
    write: (text: string) => {
      written.push(text);
      return true;
    },
  };
  return { input, output, screen: () => written.join('') };
}

/** Digita no terminal falso, "tecla" a "tecla" ou em bloco, e devolve o resultado do prompt. */
async function type(chunks: string[], terminal = fakeTerminal()) {
  const result = readHiddenLine(terminal.input, terminal.output, 'Senha: ');
  for (const chunk of chunks) terminal.input.write(chunk);
  return { result, terminal };
}

describe('readHiddenLine (prompt de senha sem eco)', () => {
  it('devolve o que foi digitado ao apertar Enter (CR)', async () => {
    const { result } = await type(['a', 'b', 'c', '\r']);

    await expect(result).resolves.toBe('abc');
  });

  it('aceita Enter como LF (\\n) e para no primeiro Enter, ignorando o resto', async () => {
    const { result } = await type(['abc\r\nresto-que-nao-conta']);

    await expect(result).resolves.toBe('abc');
  });

  it('aceita texto colado de uma vez', async () => {
    const { result } = await type(['senha-colada-123\r']);

    await expect(result).resolves.toBe('senha-colada-123');
  });

  it('Backspace apaga o último caractere (DEL e BS)', async () => {
    const { result } = await type(['abcd', '\u007f', '\b', 'x\r']);

    await expect(result).resolves.toBe('abx');
  });

  it('Backspace numa linha vazia não faz nada', async () => {
    const { result } = await type(['\u007f', '\u007f', 'ok\r']);

    await expect(result).resolves.toBe('ok');
  });

  it('um Backspace apaga um emoji inteiro (um ponto de código, não metade dele)', async () => {
    const { result } = await type(['a😀', '\u007f', 'b\r']);

    await expect(result).resolves.toBe('ab');
  });

  it('preserva espaços nas pontas e caracteres acentuados', async () => {
    const { result } = await type(['  ação ✓  \r']);

    await expect(result).resolves.toBe('  ação ✓  ');
  });

  it('ignora setas e Delete (sequências de escape) em vez de colocá-las na senha', async () => {
    const { result } = await type([
      'ab',
      '\u001b[A',
      '\u001b[3~',
      'c',
      '\u001b[D',
      'd\r',
    ]);

    await expect(result).resolves.toBe('abcd');
  });

  it('ignora outras teclas de controle (Tab etc.)', async () => {
    const { result } = await type(['a\tb\r']);

    await expect(result).resolves.toBe('ab');
  });

  it('Ctrl+C cancela com PromptCancelledError', async () => {
    const { result } = await type(['abc', '\u0003']);

    await expect(result).rejects.toBeInstanceOf(PromptCancelledError);
  });

  it('Ctrl+D cancela com PromptCancelledError', async () => {
    const { result } = await type(['\u0004']);

    await expect(result).rejects.toBeInstanceOf(PromptCancelledError);
  });

  describe('o que aparece na tela', () => {
    it('só o rótulo e a quebra de linha: nada do que foi digitado é escrito de volta', async () => {
      const { result, terminal } = await type(['senha-super-secreta', '\r']);
      await result;

      expect(terminal.screen()).toBe('Senha: \n');
      expect(terminal.screen()).not.toContain('senha');
    });

    it('nem ao apagar com Backspace nem ao cancelar', async () => {
      const first = await type(['segredo', '\u007f\u007f', '\r']);
      await first.result;
      const second = await type(['segredo', '\u0003']);
      await second.result.catch(() => undefined);

      expect(first.terminal.screen()).not.toContain('segredo');
      expect(second.terminal.screen()).not.toContain('segredo');
    });
  });

  describe('estado do terminal', () => {
    it('liga o modo raw durante a leitura e o desliga ao terminar', async () => {
      const { result, terminal } = await type(['x\r']);
      await result;

      expect(terminal.input.setRawMode.mock.calls).toEqual([[true], [false]]);
    });

    it('desliga o modo raw também quando o usuário cancela', async () => {
      const { result, terminal } = await type(['\u0003']);
      await result.catch(() => undefined);

      expect(terminal.input.setRawMode.mock.calls).toEqual([[true], [false]]);
    });

    it('pausa a entrada ao terminar (o processo precisa poder encerrar)', async () => {
      const { result, terminal } = await type(['x\r']);
      await result;

      expect(terminal.input.isPaused()).toBe(true);
    });
  });

  it('recusa uma entrada que não é um terminal interativo', async () => {
    const terminal = fakeTerminal(false);

    await expect(
      readHiddenLine(terminal.input, terminal.output, 'Senha: '),
    ).rejects.toBeInstanceOf(NotInteractiveError);
    expect(terminal.input.setRawMode).not.toHaveBeenCalled();
  });
});

describe('readAllText (senha vinda da entrada padrão)', () => {
  it('lê tudo e remove UMA quebra de linha final (\\n)', async () => {
    await expect(
      readAllText(Readable.from(['minha-senha-123\n'])),
    ).resolves.toBe('minha-senha-123');
  });

  it('remove uma quebra final \\r\\n (Windows)', async () => {
    await expect(
      readAllText(Readable.from(['minha-senha-123\r\n'])),
    ).resolves.toBe('minha-senha-123');
  });

  it('remove só uma quebra: as demais fazem parte do texto', async () => {
    await expect(readAllText(Readable.from(['abc\n\n']))).resolves.toBe(
      'abc\n',
    );
  });

  it('preserva espaços nas pontas e juntando pedaços da entrada', async () => {
    await expect(readAllText(Readable.from(['  ab', 'cd  \n']))).resolves.toBe(
      '  abcd  ',
    );
  });

  it('decodifica UTF-8 mesmo quando um caractere vem partido entre dois pedaços', async () => {
    const bytes = Buffer.from('ação\n', 'utf8');

    await expect(
      readAllText(Readable.from([bytes.subarray(0, 2), bytes.subarray(2)])),
    ).resolves.toBe('ação');
  });

  it('entrada vazia devolve texto vazio', async () => {
    await expect(readAllText(Readable.from([]))).resolves.toBe('');
  });

  it('recusa entrada acima do limite (evita encher a memória)', async () => {
    await expect(
      readAllText(Readable.from(['a'.repeat(5000)]), 4096),
    ).rejects.toThrow(/grande demais/i);
  });
});
