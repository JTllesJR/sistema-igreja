import type { SessionFamilyId, SessionId, UserId } from './ids.js';
import type { Session } from './session.js';

/**
 * Porta de persistência de `Session` (cadeia de renovação de um login).
 *
 * Contrato (verificado por `describeSessionRepositoryContract`):
 *  - `rotate(previous, next)` grava as duas sessões de forma atômica e é CONDICIONAL: só vale se a sessão anterior
 *    ainda não tinha sido trocada. Se outra requisição a trocou antes, falha com `ConcurrencyConflictError`.
 *    É isso que impede que duas requisições simultâneas com o mesmo token gerem duas sessões novas.
 *  - `revokeFamily` e `revokeAllForUser` são idempotentes e não alteram sessões já revogadas.
 */
export interface SessionRepository {
  findById(id: SessionId): Promise<Session | null>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  add(session: Session): Promise<void>;
  rotate(previous: Session, next: Session): Promise<void>;
  revokeFamily(familyId: SessionFamilyId, now: Date): Promise<void>;
  /** Revoga todas as famílias do usuário, exceto (opcionalmente) a informada. */
  revokeAllForUser(
    userId: UserId,
    now: Date,
    options?: { exceptFamilyId?: SessionFamilyId },
  ): Promise<void>;
}
