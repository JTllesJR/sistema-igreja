/**
 * Tradução do `code` de cada `DomainError` para o status HTTP (ADR 0011, seção 6).
 *
 * Fica num único lugar para a regra ser auditável. Um teste varre o código-fonte e falha se um `code` novo não estiver
 * aqui: esquecer seria um 500 silencioso em produção.
 */
export const DOMAIN_ERROR_STATUS: Readonly<Record<string, number>> = {
  'validation.invalid_value': 422,
  'concurrency.conflict': 409,

  'organization.not_found': 404,
  'organization.already_exists': 409,
  'organization.state_corrupted': 500,
  'organization.congregation_not_found': 404,
  'organization.congregation_name_taken': 409,
  'organization.congregation_inactive': 409,
  'organization.congregation_already_in_status': 409,
  'organization.congregation_already_headquarters': 409,
  'organization.cannot_deactivate_headquarters': 409,

  'members.not_found': 404,
  // 403: o usuário VÊ o membro, mas não pode esta ação. (Quem não pode nem ver recebe 'members.not_found'.)
  'members.access_denied': 403,
  'members.anonymized': 409,
  'members.already_in_status': 409,
  'members.already_in_congregation': 409,
  'members.congregation_unavailable': 422,

  // Financeiro (ADR 0015). 404: não existe ou o usuário não pode nem ver (a resposta é a mesma, de propósito).
  'finance.account_not_found': 404,
  'finance.category_not_found': 404,
  'finance.entry_not_found': 404,
  'finance.member_not_found': 404,
  'finance.account_name_taken': 409,
  'finance.category_name_taken': 409,
  // 409: o pedido já foi decidido ou o lançamento já tem estorno; o estado mudou.
  'finance.entry_not_pending': 409,
  'finance.already_reversed': 409,
  // 403: o usuário vê o dado, mas não pode esta ação financeira. Quem pediu não decide o próprio pedido.
  'finance.access_denied': 403,
  'finance.approval_not_allowed': 403,
  'finance.self_approval_forbidden': 403,
  // 422: o pedido está bem formado, mas a regra do sistema o recusa.
  'finance.account_unavailable': 422,
  'finance.category_unavailable': 422,
  'finance.member_unavailable': 422,
  'finance.congregation_unavailable': 422,
  'finance.insufficient_balance': 422,
  'finance.not_reversible': 422,
  'finance.transfer_same_congregation': 422,
  'finance.transfer_requires_headquarters': 422,

  // 403: o usuário está autenticado, mas a trilha exige `audit:read` para a igreja toda.
  'audit.access_denied': 403,

  'identity.invalid_credentials': 401,
  'identity.session_invalid': 401,
  'identity.session_reuse_detected': 401,
  'identity.permission_denied': 403,
  // 422 e não 401: o usuário está autenticado; um 401 faria o cliente achar que a sessão acabou e deslogar.
  'identity.current_password_incorrect': 422,
  'identity.email_already_registered': 409,
  'identity.user_not_found': 404,
  'identity.unknown_organization': 404,
  'identity.role_name_taken': 409,
  'identity.role_already_assigned': 409,
  'identity.last_administrator': 409,
  // 403 (e não 401): a pessoa ESTÁ autenticada; falta trocar a senha. Um 401 faria o cliente achar que a sessão acabou.
  'identity.password_change_required': 403,
  'identity.assignment_not_found': 404,
  'identity.role_not_found': 404,
  // 422: o pedido está bem formado, mas a regra do sistema o recusa (igual a validation.invalid_value).
  'identity.administrator_scope_invalid': 422,
  'identity.congregation_unavailable': 422,
};

/** Código sem entrada vira 500: um erro visível é melhor do que um palpite de 4xx. */
export function statusForDomainError(code: string): number {
  return DOMAIN_ERROR_STATUS[code] ?? 500;
}
