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

  'identity.invalid_credentials': 401,
  'identity.session_invalid': 401,
  'identity.session_reuse_detected': 401,
  // 422 e não 401: o usuário está autenticado; um 401 faria o cliente achar que a sessão acabou e deslogar.
  'identity.current_password_incorrect': 422,
  'identity.email_already_registered': 409,
  'identity.user_not_found': 404,
  'identity.unknown_organization': 404,
  'identity.role_name_taken': 409,
  'identity.role_already_assigned': 409,
};

/** Código sem entrada vira 500: um erro visível é melhor do que um palpite de 4xx. */
export function statusForDomainError(code: string): number {
  return DOMAIN_ERROR_STATUS[code] ?? 500;
}
