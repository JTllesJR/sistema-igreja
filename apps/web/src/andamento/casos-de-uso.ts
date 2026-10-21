/**
 * Estado de cada caso de uso do MVP (fonte: docs/casos-de-uso-mvp.md e docs/README.md).
 * É mantido à mão: ao entregar algo, atualize o status aqui.
 *
 * - `concluido`: funciona de ponta a ponta e foi validado com o banco real.
 * - `entregue`: API e tela prontas e testadas; falta validar com o PostgreSQL real (hoje só o CI tem banco).
 * - `backend`: regra de negócio e banco prontos e testados; falta a API HTTP e/ou a tela.
 * - `planejado`: ainda não começou.
 */
export type Status = 'concluido' | 'entregue' | 'backend' | 'planejado';

export interface CasoDeUso {
  id: string;
  titulo: string;
  modulo: string;
  status: Status;
}

export const casosDeUso: readonly CasoDeUso[] = [
  {
    id: 'UC-01',
    titulo: 'Entrar e sair do sistema',
    modulo: 'Identidade e acesso',
    status: 'entregue',
  },
  {
    id: 'UC-02',
    titulo: 'Gerenciar papéis e permissões',
    modulo: 'Identidade e acesso',
    status: 'planejado',
  },
  {
    id: 'UC-03',
    titulo: 'Convidar usuário e atribuir papel',
    modulo: 'Identidade e acesso',
    status: 'backend',
  },
  {
    id: 'UC-18',
    titulo: 'Trocar a própria senha',
    modulo: 'Identidade e acesso',
    status: 'backend',
  },
  {
    id: 'UC-04',
    titulo: 'Consultar trilha de auditoria',
    modulo: 'Identidade e acesso',
    status: 'planejado',
  },
  {
    id: 'UC-05',
    titulo: 'Cadastrar e editar congregações',
    modulo: 'Organização',
    status: 'entregue',
  },
  {
    id: 'UC-17',
    titulo: 'Criar organização inicial (operador)',
    modulo: 'Organização',
    status: 'concluido',
  },
  {
    id: 'UC-06',
    titulo: 'Cadastrar e editar membro',
    modulo: 'Membros',
    status: 'entregue',
  },
  {
    id: 'UC-07',
    titulo: 'Registrar histórico do membro',
    modulo: 'Membros',
    status: 'entregue',
  },
  {
    id: 'UC-08',
    titulo: 'Anexar documentos ao membro',
    modulo: 'Membros',
    status: 'planejado',
  },
  {
    id: 'UC-09',
    titulo: 'Listar e buscar membros',
    modulo: 'Membros',
    status: 'entregue',
  },
  {
    id: 'UC-10',
    titulo: 'Transferir membro entre congregações',
    modulo: 'Membros',
    status: 'entregue',
  },
  {
    id: 'UC-11',
    titulo: 'Gerenciar contas e categorias',
    modulo: 'Finanças',
    status: 'planejado',
  },
  {
    id: 'UC-12',
    titulo: 'Registrar entrada',
    modulo: 'Finanças',
    status: 'planejado',
  },
  {
    id: 'UC-13',
    titulo: 'Registrar saída',
    modulo: 'Finanças',
    status: 'planejado',
  },
  {
    id: 'UC-14',
    titulo: 'Estornar lançamento',
    modulo: 'Finanças',
    status: 'planejado',
  },
  {
    id: 'UC-15',
    titulo: 'Dashboard financeiro da congregação',
    modulo: 'Finanças',
    status: 'planejado',
  },
  {
    id: 'UC-16',
    titulo: 'Dashboard consolidado da diretoria',
    modulo: 'Diretoria',
    status: 'planejado',
  },
];

export interface Resumo {
  total: number;
  concluidos: number;
  entregues: number;
  backend: number;
  planejados: number;
  /** Percentual 0–100 de casos de uso com API e tela prontas (concluídos ou entregues). */
  percentualEntregue: number;
}

export function resumir(lista: readonly CasoDeUso[]): Resumo {
  const contar = (status: Status) =>
    lista.filter((c) => c.status === status).length;
  const total = lista.length;
  const concluidos = contar('concluido');
  return {
    total,
    concluidos,
    entregues: contar('entregue'),
    backend: contar('backend'),
    planejados: contar('planejado'),
    percentualEntregue:
      total === 0
        ? 0
        : Math.round(((concluidos + contar('entregue')) / total) * 100),
  };
}

/** Agrupa mantendo a ordem em que cada módulo aparece pela primeira vez. */
export function agruparPorModulo(
  lista: readonly CasoDeUso[],
): [string, CasoDeUso[]][] {
  const grupos = new Map<string, CasoDeUso[]>();
  for (const caso of lista) {
    const grupo = grupos.get(caso.modulo) ?? [];
    grupo.push(caso);
    grupos.set(caso.modulo, grupo);
  }
  return [...grupos];
}
