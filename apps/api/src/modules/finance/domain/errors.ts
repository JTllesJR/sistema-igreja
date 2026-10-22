import { DomainError } from '../../../shared/domain/domain-error.js';

export class AccountNotFoundError extends DomainError {
  constructor() {
    super('finance.account_not_found', 'Conta não encontrada.');
  }
}

export class CategoryNotFoundError extends DomainError {
  constructor() {
    super('finance.category_not_found', 'Categoria não encontrada.');
  }
}

/** Lançamento inexistente, de outra igreja ou de congregação que o usuário não pode ver: a resposta é a mesma. */
export class EntryNotFoundError extends DomainError {
  constructor() {
    super('finance.entry_not_found', 'Lançamento não encontrado.');
  }
}

export class AccountNameTakenError extends DomainError {
  constructor() {
    super(
      'finance.account_name_taken',
      'Já existe uma conta com este nome nesta congregação.',
    );
  }
}

export class CategoryNameTakenError extends DomainError {
  constructor() {
    super(
      'finance.category_name_taken',
      'Já existe uma categoria com este nome nesta igreja.',
    );
  }
}

/** A conta está arquivada (ou a congregação desativada): não recebe lançamentos novos. */
export class AccountUnavailableError extends DomainError {
  constructor() {
    super(
      'finance.account_unavailable',
      'A conta está arquivada e não recebe novos lançamentos.',
    );
  }
}

/** A categoria não serve para este lançamento (sentido diferente) ou está arquivada. */
export class CategoryUnavailableError extends DomainError {
  constructor() {
    super(
      'finance.category_unavailable',
      'A categoria não serve para este lançamento (sentido diferente ou arquivada).',
    );
  }
}

/** O usuário enxerga o dado, mas não tem permissão para esta ação (ou não pode agir naquela congregação). */
export class FinanceAccessDeniedError extends DomainError {
  constructor() {
    super(
      'finance.access_denied',
      'Você não tem permissão para esta ação financeira nesta congregação.',
    );
  }
}

/** Só a sede decide pedidos financeiros: o escopo do usuário precisa alcançar a sede. */
export class ApprovalNotAllowedError extends DomainError {
  constructor() {
    super(
      'finance.approval_not_allowed',
      'Apenas quem atua na sede pode aprovar ou recusar pedidos.',
    );
  }
}

/** SEPARAÇÃO DE FUNÇÕES: quem pediu não decide o próprio pedido. */
export class SelfApprovalError extends DomainError {
  constructor() {
    super(
      'finance.self_approval_forbidden',
      'Quem fez o pedido não pode aprová-lo nem recusá-lo. Outra pessoa da sede precisa decidir.',
    );
  }
}

/** O lançamento já foi decidido (ou cancelado): nada mais muda nele. */
export class EntryNotPendingError extends DomainError {
  constructor() {
    super(
      'finance.entry_not_pending',
      'Este pedido já foi decidido e não pode mais ser alterado.',
    );
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor() {
    super(
      'finance.insufficient_balance',
      'O saldo da conta não cobre esta saída.',
    );
  }
}

export class AlreadyReversedError extends DomainError {
  constructor() {
    super(
      'finance.already_reversed',
      'Este lançamento já foi estornado (ou tem um estorno aguardando a sede).',
    );
  }
}

/** Só lançamento confirmado, comum ou saldo inicial, pode ser estornado. */
export class NotReversibleError extends DomainError {
  constructor() {
    super(
      'finance.not_reversible',
      'Só se estorna lançamento confirmado, comum ou de saldo inicial. Um repasse errado se corrige com outro repasse.',
    );
  }
}

export class TransferSameCongregationError extends DomainError {
  constructor() {
    super(
      'finance.transfer_same_congregation',
      'O repasse é entre congregações diferentes.',
    );
  }
}

/** O membro informado não existe nesta igreja (ou já foi anonimizado). */
export class MemberUnavailableError extends DomainError {
  constructor() {
    super(
      'finance.member_unavailable',
      'O membro informado não existe nesta igreja.',
    );
  }
}

export class CongregationUnavailableError extends DomainError {
  constructor() {
    super(
      'finance.congregation_unavailable',
      'A congregação não existe ou está desativada.',
    );
  }
}

/** Repasse é entre a sede e uma congregação: uma das pontas precisa ser a sede. */
export class TransferRequiresHeadquartersError extends DomainError {
  constructor() {
    super(
      'finance.transfer_requires_headquarters',
      'O repasse é entre a sede e uma congregação: uma das contas precisa ser da sede.',
    );
  }
}

/** O membro consultado não existe nesta igreja, ou não há nada dele que o usuário possa ver: a resposta é a mesma. */
export class ContributorNotFoundError extends DomainError {
  constructor() {
    super('finance.member_not_found', 'Membro não encontrado.');
  }
}
