import type { ActorId, OrganizationId } from '../domain/identifiers.js';

/**
 * Um fato auditável: QUEM fez O QUÊ, em qual dado, e quando (o instante é do banco, não de quem registra).
 *
 * `metadata` é só para contexto técnico (quantos resultados, quais CAMPOS mudaram). NUNCA coloque nela dado pessoal
 * (nome, telefone, termo de busca): a trilha de auditoria não pode virar um segundo cadastro de pessoas.
 */
export interface AuditEntry {
  organizationId: OrganizationId;
  actorId: ActorId;
  /** Verbo no passado, com o módulo na frente: `member.viewed`, `member.registered`. */
  action: string;
  /** O tipo do dado afetado: `member`. */
  entity: string;
  entityId: string | null;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Porta da trilha de auditoria (RN-04, ADR 0006): somente-anexação. O módulo `audit` a implementa; cada módulo de
 * negócio a usa sem saber onde nem como é guardada.
 *
 * Para LEITURA de dado sensível, quem chama registra ANTES de devolver os dados e deixa a falha subir: sem trilha, sem
 * dado (falha fechada).
 */
export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}
