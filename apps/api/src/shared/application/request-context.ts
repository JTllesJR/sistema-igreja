import type { ActorId, OrganizationId } from '../domain/identifiers.js';

/**
 * Quem está pedindo e em nome de qual igreja. Primeiro parâmetro de todo caso de uso (ADR 0009).
 *
 * `organizationId` vem da identidade autenticada, nunca de entrada do cliente (ADR 0003): como nenhum caso de
 * uso aceita outro id de organização, não existe caminho de código para tocar os dados de outra igreja.
 */
export interface RequestContext {
  readonly organizationId: OrganizationId;
  readonly actorId: ActorId;
}
