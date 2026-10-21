import type { Brand } from '../../../shared/domain/brand.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { isUuid } from '../../../shared/domain/uuid.js';

export type OrganizationId = Brand<string, 'OrganizationId'>;
export type CongregationId = Brand<string, 'CongregationId'>;

function parseId<B extends string>(value: string): Brand<string, B> {
  if (!isUuid(value)) {
    throw new ValidationError('id', 'Identificador inválido.');
  }
  return value as Brand<string, B>;
}

// O tipo e o objeto têm o mesmo nome de propósito: `OrganizationId` serve como tipo e como fábrica (`OrganizationId.of`).
export const OrganizationId = {
  of: (value: string): OrganizationId => parseId<'OrganizationId'>(value),
};

export const CongregationId = {
  of: (value: string): CongregationId => parseId<'CongregationId'>(value),
};
