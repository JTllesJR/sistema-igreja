// `OrganizationId` e `CongregationId` moram no kernel compartilhado (vários módulos os usam);
// são reexportados aqui por conveniência dos arquivos do módulo.
export {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
