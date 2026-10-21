/**
 * Base de todo erro causado por violação de regra de negócio.
 *
 * `code` é estável e legível por máquina (a camada HTTP o traduz em status e o cliente pode reagir a ele);
 * `message` é voltada ao usuário e pode ser reescrita sem quebrar ninguém.
 */
export abstract class DomainError extends Error {
  protected constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Um valor informado não respeita o formato ou os limites do campo. */
export class ValidationError extends DomainError {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super('validation.invalid_value', message);
  }
}
