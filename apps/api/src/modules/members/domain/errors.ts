import { DomainError } from '../../../shared/domain/domain-error.js';
import type { MemberStatus } from './member-status.js';

/**
 * Membro inexistente, de OUTRA igreja ou de uma congregação que o usuário não pode ver: a resposta é a mesma nos três
 * casos, para não revelar quem está cadastrado (ADR 0003 e 0013).
 */
export class MemberNotFoundError extends DomainError {
  constructor() {
    super('members.not_found', 'Membro não encontrado.');
  }
}

/** O usuário enxerga o membro, mas não tem permissão para esta ação nele (ou na congregação de destino). */
export class MemberAccessDeniedError extends DomainError {
  constructor() {
    super(
      'members.access_denied',
      'Você não tem permissão para esta ação nesta congregação.',
    );
  }
}

/** Dados pessoais já foram apagados (anonimização é irreversível): o cadastro não aceita mais alterações. */
export class MemberAnonymizedError extends DomainError {
  constructor() {
    super(
      'members.anonymized',
      'Os dados deste membro foram anonimizados e não podem mais ser alterados.',
    );
  }
}

export class MemberAlreadyInStatusError extends DomainError {
  constructor(status: MemberStatus) {
    super(
      'members.already_in_status',
      `O membro já está na situação ${status}.`,
    );
  }
}

export class MemberAlreadyInCongregationError extends DomainError {
  constructor() {
    super(
      'members.already_in_congregation',
      'O membro já pertence a esta congregação.',
    );
  }
}

/** A congregação informada não existe nesta igreja ou está desativada: não recebe novos membros. */
export class CongregationUnavailableError extends DomainError {
  constructor() {
    super(
      'members.congregation_unavailable',
      'A congregação informada não existe ou está desativada.',
    );
  }
}
