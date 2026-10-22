import type { PermissionDefinition } from '../../shared/application/permission-definition.js';

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

/** Para o catálogo de permissões (ADR 0019): o que aparece ao montar um papel. */
export const FINANCE_PERMISSIONS: readonly PermissionDefinition[] = [
  {
    key: FINANCE_READ,
    description:
      'Ver painéis, contas e lançamentos, sem saber quem contribuiu.',
  },
  {
    key: FINANCE_WRITE,
    description:
      'Lançar entradas, pedir saídas, repasses e estornos e criar contas.',
  },
  {
    key: FINANCE_APPROVE,
    description:
      'Aprovar ou recusar pedidos financeiros (vale para quem alcança a sede).',
  },
  {
    key: FINANCE_READ_INDIVIDUAL,
    description:
      'Ver quem contribuiu e o extrato de contribuição de um membro.',
  },
];
