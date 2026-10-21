import type { Brand } from '../../../shared/domain/brand.js';
import { parseIdentifier } from '../../../shared/domain/identifiers.js';

// `OrganizationId` mora no kernel compartilhado (todo módulo o usa); é reexportado aqui por conveniência.
export { OrganizationId } from '../../../shared/domain/identifiers.js';

export type CongregationId = Brand<string, 'CongregationId'>;
export const CongregationId = {
  of: (value: string): CongregationId =>
    parseIdentifier<'CongregationId'>(value),
};
