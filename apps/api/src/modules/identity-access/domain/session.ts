import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import { SessionInvalidError } from './errors.js';
import type { SessionFamilyId, SessionId, UserId } from './ids.js';

const DAY = 24 * 60 * 60_000;

/** Validade do token de renovação: deslizante (renovada a cada rotação) com um teto absoluto (ADR 0010). */
export interface SessionPolicy {
  idleMs: number;
  absoluteMs: number;
}
export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleMs: 30 * DAY,
  absoluteMs: 90 * DAY,
};

export type SessionState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ROTATED';

export interface SessionProps {
  id: SessionId;
  organizationId: OrganizationId;
  userId: UserId;
  familyId: SessionFamilyId;
  /** Hash do token de renovação. O token em si nunca é guardado. */
  tokenHash: string;
  createdAt: Date;
  /** Quando a família (o login original) começou; o teto absoluto conta a partir daqui. */
  familyStartedAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Uma linha da cadeia de renovação de um login. Imutável: cada mudança devolve uma nova instância.
 *
 * A cada renovação a sessão atual passa a ROTATED e nasce a próxima, na mesma família. Reapresentar um token
 * ROTATED indica roubo; o caso de uso então revoga a família inteira.
 */
export class Session {
  private constructor(private readonly props: SessionProps) {}

  static start(input: {
    id: SessionId;
    organizationId: OrganizationId;
    userId: UserId;
    familyId: SessionFamilyId;
    tokenHash: string;
    now: Date;
    policy: SessionPolicy;
  }): Session {
    return new Session({
      id: input.id,
      organizationId: input.organizationId,
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      createdAt: input.now,
      familyStartedAt: input.now,
      expiresAt: new Date(input.now.getTime() + input.policy.idleMs),
      rotatedAt: null,
      revokedAt: null,
    });
  }

  static restore(props: SessionProps): Session {
    return new Session(props);
  }

  get id(): SessionId {
    return this.props.id;
  }
  get organizationId(): OrganizationId {
    return this.props.organizationId;
  }
  get userId(): UserId {
    return this.props.userId;
  }
  get familyId(): SessionFamilyId {
    return this.props.familyId;
  }
  get tokenHash(): string {
    return this.props.tokenHash;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get familyStartedAt(): Date {
    return this.props.familyStartedAt;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get rotatedAt(): Date | null {
    return this.props.rotatedAt;
  }
  get revokedAt(): Date | null {
    return this.props.revokedAt;
  }

  /** Revogada vence rotacionada, que vence expirada: a família morta não deve parecer "reuso". */
  state(now: Date): SessionState {
    if (this.props.revokedAt !== null) return 'REVOKED';
    if (this.props.rotatedAt !== null) return 'ROTATED';
    if (now.getTime() >= this.props.expiresAt.getTime()) return 'EXPIRED';
    return 'ACTIVE';
  }

  /** Idempotente: revogar de novo mantém o primeiro instante. */
  revoke(now: Date): Session {
    if (this.props.revokedAt !== null) return this;
    return new Session({ ...this.props, revokedAt: now });
  }

  /** Só uma sessão ATIVA pode ser trocada; o novo prazo respeita o teto absoluto da família. */
  rotate(input: {
    nextId: SessionId;
    nextTokenHash: string;
    now: Date;
    policy: SessionPolicy;
  }): { previous: Session; next: Session } {
    if (this.state(input.now) !== 'ACTIVE') throw new SessionInvalidError();

    const idleDeadline = input.now.getTime() + input.policy.idleMs;
    const absoluteDeadline =
      this.props.familyStartedAt.getTime() + input.policy.absoluteMs;

    return {
      previous: new Session({ ...this.props, rotatedAt: input.now }),
      next: new Session({
        ...this.props,
        id: input.nextId,
        tokenHash: input.nextTokenHash,
        createdAt: input.now,
        expiresAt: new Date(Math.min(idleDeadline, absoluteDeadline)),
        rotatedAt: null,
        revokedAt: null,
      }),
    };
  }
}
