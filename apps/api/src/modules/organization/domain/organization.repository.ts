import type { OrganizationId } from './ids.js';
import type { Organization } from './organization.js';

/**
 * Porta de persistência do agregado `Organization` (a interface mora no domínio; a implementação, na infraestrutura).
 *
 * Contrato (verificado por `describeOrganizationRepositoryContract`):
 *  - `findById` devolve uma cópia independente: alterar o objeto não muda nada até chamar `save`.
 *  - `add` insere uma organização nova e falha se o id já existe.
 *  - `save` grava as alterações do agregado inteiro (organização e congregações) em uma única operação atômica.
 *    Usa travamento otimista: se outra gravação ocorreu desde a leitura, falha com `ConcurrencyConflictError`
 *    e não sobrescreve nada. A cada `save` bem-sucedido a versão avança em 1.
 */
export interface OrganizationRepository {
  findById(id: OrganizationId): Promise<Organization | null>;
  add(organization: Organization): Promise<void>;
  save(organization: Organization): Promise<void>;
}
