import { ValidationError } from '../../../shared/domain/domain-error.js';
import { collapseWhitespace } from '../../../shared/domain/text.js';

const CONTROL_CHARACTERS = /\p{Cc}/u;

/** Nome de conta ou de categoria: 1 a 80 caracteres, sem caracteres de controle. */
export function validName(raw: string, field: string): string {
  const value = collapseWhitespace(raw);
  if (value.length < 1 || value.length > 80 || CONTROL_CHARACTERS.test(value)) {
    throw new ValidationError(
      field,
      'O nome deve ter entre 1 e 80 caracteres.',
    );
  }
  return value;
}

/**
 * Texto livre opcional de um lançamento (descrição, motivo). Cuidado: texto livre PODE ter dado pessoal digitado por
 * engano, então ele nunca vai para a trilha de auditoria nem para um log.
 */
export function optionalNote(
  raw: string | null | undefined,
  max: number,
  field: string,
): string | null {
  if (raw === null || raw === undefined) return null;
  const value = collapseWhitespace(raw);
  if (value === '') return null;
  if (value.length > max || CONTROL_CHARACTERS.test(value)) {
    throw new ValidationError(
      field,
      `O texto deve ter no máximo ${max} caracteres.`,
    );
  }
  return value;
}
