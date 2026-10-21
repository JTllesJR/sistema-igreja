import { ValidationError } from '../../../shared/domain/domain-error.js';

const MAX_LENGTH = 254;
// Verificação propositalmente SIMPLES (algo@dominio.tld): a única prova de que um e-mail existe é enviar uma mensagem.
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHARACTERS = /\p{Cc}/u;

/** E-mail de contato de um membro (não é o login do sistema). Normalizado em minúsculas. */
export class ContactEmail {
  private constructor(readonly value: string) {}

  static create(raw: string): ContactEmail {
    const value = raw.trim().toLowerCase();

    if (
      value.length > MAX_LENGTH ||
      !SHAPE.test(value) ||
      CONTROL_CHARACTERS.test(value)
    ) {
      throw new ValidationError('email', 'O e-mail informado não é válido.');
    }
    return new ContactEmail(value);
  }

  equals(other: ContactEmail): boolean {
    return this.value === other.value;
  }
}
