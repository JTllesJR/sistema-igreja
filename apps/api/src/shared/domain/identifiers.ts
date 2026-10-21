import type { Brand } from './brand.js';
import { ValidationError } from './domain-error.js';
import { isUuid } from './uuid.js';

/** Valida o formato UUID e aplica a "marca" de tipo. Base de todos os identificadores do sistema. */
export function parseIdentifier<B extends string>(
  value: string,
): Brand<string, B> {
  if (!isUuid(value)) {
    throw new ValidationError('id', 'Identificador inválido.');
  }
  return value as Brand<string, B>;
}

// Kernel compartilhado: toda tabela de negócio tem `organization_id` (ADR 0003), então todo módulo precisa deste tipo.
// O tipo e o objeto têm o mesmo nome de propósito: `OrganizationId` serve como tipo e como fábrica (`OrganizationId.of`).
export type OrganizationId = Brand<string, 'OrganizationId'>;
export const OrganizationId = {
  of: (value: string): OrganizationId =>
    parseIdentifier<'OrganizationId'>(value),
};

/** Quem executa a operação (hoje reservado para auditoria; será o id do usuário do `identity-access`). */
export type ActorId = Brand<string, 'ActorId'>;
export const ActorId = {
  of: (value: string): ActorId => parseIdentifier<'ActorId'>(value),
};
