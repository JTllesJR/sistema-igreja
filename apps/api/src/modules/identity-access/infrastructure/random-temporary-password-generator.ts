import { randomInt } from 'node:crypto';
import type { TemporaryPasswordGenerator } from '../application/temporary-password-generator.js';

// Sem 0/O, 1/l/I: a senha é lida e ditada por uma pessoa (e repassada ao usuário, por exemplo, pelo WhatsApp), e esses
// pares se confundem. Sobram 57 símbolos; 16 deles dão cerca de 93 bits, muito além do que o hash e o limite de
// tentativas exigem de uma senha que vale até o primeiro acesso.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = UPPER + LOWER + DIGITS;

const GROUPS = 4;
const GROUP_LENGTH = 4;

/** Quatro grupos de quatro símbolos (`Abcd-Efgh-Jkmn-Pqrs`): fácil de ler, copiar e ditar. */
export class RandomTemporaryPasswordGenerator implements TemporaryPasswordGenerator {
  generate(): string {
    return Array.from({ length: GROUPS }, () =>
      Array.from(
        { length: GROUP_LENGTH },
        // `randomInt` sorteia sem o viés do módulo (um `% 57` favoreceria os primeiros símbolos).
        () => ALPHABET[randomInt(ALPHABET.length)],
      ).join(''),
    ).join('-');
  }
}
