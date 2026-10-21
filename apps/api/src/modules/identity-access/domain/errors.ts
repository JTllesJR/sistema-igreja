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

/** Um token de renovação já trocado foi reapresentado: tratado como roubo; a família inteira foi revogada. */
export class SessionReuseDetectedError extends DomainError {
  constructor() {
    super(
      'identity.session_reuse_detected',
      'Sessão inválida ou expirada. Entre novamente.',
    );
  }
}

/** Usuário autenticado, mas sem a permissão que a rota exige (ADR 0004 e 0011). */
export class PermissionDeniedError extends DomainError {
  constructor() {
    super(
      'identity.permission_denied',
      'Você não tem permissão para esta ação.',
    );
  }
}

/** Erro único de login: não revela se o e-mail existe, se a senha está errada ou se a conta está bloqueada. */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('identity.invalid_credentials', 'E-mail ou senha incorretos.');
  }
}

export class CurrentPasswordIncorrectError extends DomainError {
  constructor() {
    super(
      'identity.current_password_incorrect',
      'A senha atual está incorreta.',
    );
  }
}

export class EmailAlreadyRegisteredError extends DomainError {
  constructor() {
    super(
      'identity.email_already_registered',
      'Já existe um usuário com este e-mail.',
    );
  }
}

export class UserNotFoundError extends DomainError {
  constructor() {
    super('identity.user_not_found', 'Usuário não encontrado.');
  }
}

export class RoleNameAlreadyInUseError extends DomainError {
  constructor(name: string) {
    super(
      'identity.role_name_taken',
      `Já existe um papel chamado "${name}" nesta igreja.`,
    );
  }
}

/** A organização informada não existe (verificado pela porta OrganizationDirectory). */
export class UnknownOrganizationError extends DomainError {
  constructor() {
    super('identity.unknown_organization', 'Igreja não encontrada.');
  }
}
