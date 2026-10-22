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

/** O usuário não tem esta atribuição (papel + escopo). */
export class AssignmentNotFoundError extends DomainError {
  constructor() {
    super(
      'identity.assignment_not_found',
      'Este usuário não possui este papel neste escopo.',
    );
  }
}

/** A igreja ficaria sem nenhum Administrador ativo, e ninguém mais conseguiria administrar o sistema. */
export class LastAdministratorError extends DomainError {
  constructor() {
    super(
      'identity.last_administrator',
      'A igreja precisa ter ao menos um Administrador ativo. Atribua o papel a outra pessoa antes.',
    );
  }
}

/** O papel não existe NESTA igreja (inclusive se existir em outra: o isolamento não revela qual dos casos ocorreu). */
export class RoleNotFoundError extends DomainError {
  constructor() {
    super('identity.role_not_found', 'Papel não encontrado.');
  }
}

/** O Administrador vale para a igreja toda: "Administrador de uma congregação" seria ambíguo (ADR 0014). */
export class AdministratorScopeError extends DomainError {
  constructor() {
    super(
      'identity.administrator_scope_invalid',
      'O papel Administrador só pode ser atribuído para a igreja toda.',
    );
  }
}

/** A congregação não existe nesta igreja ou está inativa: não dá para atribuir um papel nela. */
export class CongregationUnavailableError extends DomainError {
  constructor() {
    super(
      'identity.congregation_unavailable',
      'A congregação não existe ou está inativa.',
    );
  }
}
