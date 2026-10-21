import { DomainError } from '../../../shared/domain/domain-error.js';

// Cada erro tem um `code` estável (usado pela camada HTTP e por clientes) e uma mensagem para o usuário.

export class CongregationNameAlreadyInUseError extends DomainError {
  constructor(name: string) {
    super(
      'organization.congregation_name_taken',
      `Já existe uma congregação com o nome "${name}" nesta igreja.`,
    );
  }
}

export class CongregationNotFoundError extends DomainError {
  constructor(id: string) {
    super(
      'organization.congregation_not_found',
      `Congregação ${id} não encontrada.`,
    );
  }
}

export class CannotDeactivateHeadquartersError extends DomainError {
  constructor() {
    super(
      'organization.cannot_deactivate_headquarters',
      'A sede não pode ser desativada. Designe outra congregação como sede antes.',
    );
  }
}

export class CongregationInactiveError extends DomainError {
  constructor() {
    super(
      'organization.congregation_inactive',
      'A congregação está inativa. Reative-a antes de continuar.',
    );
  }
}

export class CongregationAlreadyInStatusError extends DomainError {
  constructor(status: 'ACTIVE' | 'INACTIVE') {
    super(
      'organization.congregation_already_in_status',
      status === 'ACTIVE'
        ? 'A congregação já está ativa.'
        : 'A congregação já está inativa.',
    );
  }
}

export class CongregationAlreadyHeadquartersError extends DomainError {
  constructor() {
    super(
      'organization.congregation_already_headquarters',
      'Esta congregação já é a sede.',
    );
  }
}

/** Os dados lidos do banco violam uma invariante: indica corrupção ou escrita fora do domínio. */
export class OrganizationStateCorruptedError extends DomainError {
  constructor(reason: string) {
    super(
      'organization.state_corrupted',
      `Estado inconsistente da organização: ${reason}`,
    );
  }
}
