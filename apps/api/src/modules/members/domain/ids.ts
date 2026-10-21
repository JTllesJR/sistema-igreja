import type { Brand } from '../../../shared/domain/brand.js';
import { parseIdentifier } from '../../../shared/domain/identifiers.js';

export type MemberId = Brand<string, 'MemberId'>;
export const MemberId = {
  of: (value: string): MemberId => parseIdentifier<'MemberId'>(value),
};

export type MemberEventId = Brand<string, 'MemberEventId'>;
export const MemberEventId = {
  of: (value: string): MemberEventId => parseIdentifier<'MemberEventId'>(value),
};
