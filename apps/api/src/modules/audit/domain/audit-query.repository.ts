import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { AuditRecord, AuditSearchCriteria } from './audit-record.js';

/**
 * Porta de LEITURA da trilha (a escrita é a porta `AuditLog`, em `shared/application`). Toda consulta é filtrada pela
 * igreja (ADR 0003): não existe método que receba só um id.
 *
 * Contrato (verificado por `describeAuditQueryContract`):
 *  - devolve no máximo `limit` registros, do mais recente para o mais antigo (instante e, no empate, id decrescentes);
 *  - `before` devolve só os ESTRITAMENTE mais antigos que o cursor, sem repetir nem pular registro entre páginas;
 *  - os filtros se combinam com E; `from` e `to` são inclusivos;
 *  - `module` casa só ações que COMEÇAM com `<module>.`; o texto é sempre literal (nunca um padrão).
 */
export interface AuditQueryRepository {
  search(
    organizationId: OrganizationId,
    criteria: AuditSearchCriteria,
  ): Promise<AuditRecord[]>;
}
