import { DomainError } from './domain-error.js';

/**
 * Travamento otimista: os dados foram alterados por outra operação entre a leitura e a gravação.
 * Nada é sobrescrito; quem chamou deve recarregar e tentar de novo (HTTP 409 na camada de apresentação).
 */
export class ConcurrencyConflictError extends DomainError {
  constructor() {
    super(
      'concurrency.conflict',
      'Os dados foram alterados por outra operação. Recarregue e tente novamente.',
    );
  }
}
