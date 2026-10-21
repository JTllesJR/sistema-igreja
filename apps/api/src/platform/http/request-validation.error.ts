/** Um problema encontrado na entrada: onde (ex.: `profile.age`) e o que está errado. Nunca contém o valor enviado. */
export interface RequestIssue {
  path: string;
  message: string;
}

/**
 * Corpo, parâmetros ou consulta da requisição não respeitam o schema (HTTP 400).
 * Não é um `DomainError`: a regra de negócio nem chegou a ser consultada.
 */
export class RequestValidationError extends Error {
  constructor(readonly issues: readonly RequestIssue[]) {
    super('A requisição é inválida.');
    this.name = 'RequestValidationError';
  }
}
