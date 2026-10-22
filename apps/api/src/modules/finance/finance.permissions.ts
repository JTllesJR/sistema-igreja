/**
 * Permissões do módulo `finance` (ADR 0004: cada módulo define as suas; ADR 0015). Todas valem por congregação, e o
 * Administrador as tem pelo curinga `*`. As quatro são independentes: nenhuma implica outra.
 */

/** Ver painéis, contas e lançamentos. NÃO revela quem contribuiu (veja `FINANCE_READ_INDIVIDUAL`). */
export const FINANCE_READ = 'finance:read';

/** Lançar entradas, pedir saídas, repasses e estornos, cancelar pedidos e criar contas. */
export const FINANCE_WRITE = 'finance:write';

/**
 * Aprovar ou recusar pedidos. Só vale para decidir se o alcance de quem a tem chega à SEDE: aprovar é uma decisão da sede
 * (ADR 0015, item 4).
 */
export const FINANCE_APPROVE = 'finance:approve';

/** Ver QUEM contribuiu (dado sensível, ADR 0006) e o extrato individual de um membro. Toda leitura é auditada. */
export const FINANCE_READ_INDIVIDUAL = 'finance:read-individual';
