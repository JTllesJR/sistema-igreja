import type { CongregationId } from '../../../shared/domain/identifiers.js';

/**
 * O que o usuário pode fazer no financeiro, JÁ resolvido a partir das permissões dele (ADR 0004 e 0015). A camada de
 * apresentação monta isto a partir da política de acesso; os casos de uso decidem por escopo sem conhecer papéis nem o
 * módulo `identity-access`.
 *
 * As quatro permissões são independentes: ver os números, lançar, aprovar e ver QUEM contribuiu não se implicam.
 */
export interface FinanceAccess {
  /** Congregações cujos números o usuário pode VER. `null` = a igreja toda. Lista vazia = nenhuma. */
  readableCongregations(): readonly CongregationId[] | null;
  canRead(congregationId: CongregationId): boolean;
  /** Pode lançar (entrada, pedido de saída, repasse, estorno, conta) NESTA congregação? */
  canWrite(congregationId: CongregationId): boolean;
  /** Congregações em que o usuário pode ver QUEM contribuiu (dado sensível). `null` = todas. */
  individualCongregations(): readonly CongregationId[] | null;
  canReadIndividual(congregationId: CongregationId): boolean;
  /**
   * Pode decidir pedidos? Só vale se o alcance do usuário chega à SEDE: quem aprova é a sede (ADR 0015, item 4).
   */
  canApprove(headquarters: CongregationId): boolean;
  /** Categorias são da igreja toda, então criá-las exige escrita na igreja toda. */
  canManageCategories(): boolean;
}
