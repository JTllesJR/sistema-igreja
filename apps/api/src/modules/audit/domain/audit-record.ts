import type {
  ActorId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';

/** Um fato já gravado na trilha. Só leitura: a trilha é somente-anexação (gatilho no banco, ADR 0013). */
export interface AuditRecord {
  id: string;
  organizationId: OrganizationId;
  actorId: ActorId;
  /** Verbo no passado com o módulo na frente: `member.viewed`. */
  action: string;
  entity: string;
  entityId: string | null;
  /** Contexto técnico. NUNCA dado pessoal (regra de quem grava). */
  metadata: Readonly<Record<string, string | number | boolean | null>> | null;
  /** O instante do BANCO, não de quem registrou. */
  occurredAt: Date;
}

/** Posição numa página: o registro mais antigo já entregue. A ordem é (instante, id), do maior para o menor. */
export interface AuditCursor {
  occurredAt: Date;
  id: string;
}

export interface AuditSearchCriteria {
  actorId: string | null;
  entity: string | null;
  entityId: string | null;
  /** Ação exata. */
  action: string | null;
  /** Prefixo de módulo SEM o ponto (`finance`). Já validado: só letras minúsculas e hífen, nunca curinga. */
  module: string | null;
  /** Inclusive. */
  from: Date | null;
  /** Inclusive. */
  to: Date | null;
  /** Só registros ESTRITAMENTE mais antigos que este. */
  before: AuditCursor | null;
  limit: number;
}
