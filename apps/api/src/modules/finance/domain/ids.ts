import type { Brand } from '../../../shared/domain/brand.js';
import { parseIdentifier } from '../../../shared/domain/identifiers.js';

export type AccountId = Brand<string, 'AccountId'>;
export const AccountId = {
  of: (value: string): AccountId => parseIdentifier<'AccountId'>(value),
};

export type CategoryId = Brand<string, 'CategoryId'>;
export const CategoryId = {
  of: (value: string): CategoryId => parseIdentifier<'CategoryId'>(value),
};

export type EntryId = Brand<string, 'EntryId'>;
export const EntryId = {
  of: (value: string): EntryId => parseIdentifier<'EntryId'>(value),
};

/** As duas pernas de um repasse compartilham este id. */
export type TransferId = Brand<string, 'TransferId'>;
export const TransferId = {
  of: (value: string): TransferId => parseIdentifier<'TransferId'>(value),
};
