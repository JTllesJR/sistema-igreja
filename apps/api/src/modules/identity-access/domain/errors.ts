import { DomainError } from '../../../shared/domain/domain-error.js';

export class RoleAlreadyAssignedError extends DomainError {
  constructor() {
    super(
      'identity.role_already_assigned',
      'Este usuário já possui este papel neste escopo.',
    );
  }
}

/** Sessão inexistente, expirada, revogada ou já trocada. Mensagem única: não revela qual dos casos ocorreu. */
export class SessionInvalidError extends DomainError {
  constructor() {
    super(
      'identity.session_invalid',
      'Sessão inválida ou expirada. Entre novamente.',
    );
  }
}
