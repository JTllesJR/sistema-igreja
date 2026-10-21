import type { Brand } from '../../../shared/domain/brand.js';
import { parseIdentifier } from '../../../shared/domain/identifiers.js';

export type UserId = Brand<string, 'UserId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type SessionId = Brand<string, 'SessionId'>;
/** Todas as sessões geradas por rotação a partir de um mesmo login compartilham a família. */
export type SessionFamilyId = Brand<string, 'SessionFamilyId'>;

export const UserId = {
  of: (value: string): UserId => parseIdentifier<'UserId'>(value),
};
export const RoleId = {
  of: (value: string): RoleId => parseIdentifier<'RoleId'>(value),
};
export const SessionId = {
  of: (value: string): SessionId => parseIdentifier<'SessionId'>(value),
};
export const SessionFamilyId = {
  of: (value: string): SessionFamilyId =>
    parseIdentifier<'SessionFamilyId'>(value),
};
