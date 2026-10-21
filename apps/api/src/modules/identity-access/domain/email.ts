import { ValidationError } from '../../../shared/domain/domain-error.js';

const MAX_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * E-mail normalizado (aparado, minúsculas): é a identidade de login (ADR 0010).
 * A validação é propositalmente simples; a prova real de que o endereço existe é enviar uma mensagem.
 */
export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();

    if (!isValid(value)) {
      throw new ValidationError('email', 'O e-mail informado é inválido.');
    }
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}

function isValid(value: string): boolean {
  if (value.length === 0 || value.length > MAX_LENGTH) return false;

  const parts = value.split('@');
  if (parts.length !== 2) return false;

  const [local = '', domain = ''] = parts;
  if (
    local.length === 0 ||
    local.length > MAX_LOCAL_LENGTH ||
    /\s/.test(local)
  ) {
    return false;
  }

  const labels = domain.split('.');
  return (
    labels.length >= 2 &&
    labels.every((label) => label.length <= 63 && DOMAIN_LABEL.test(label))
  );
}
