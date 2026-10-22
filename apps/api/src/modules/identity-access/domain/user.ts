import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import type { Email } from './email.js';
import { AssignmentNotFoundError, RoleAlreadyAssignedError } from './errors.js';
import type { RoleId, UserId } from './ids.js';
import type { PasswordHash } from './password-hash.js';
import { RoleAssignment } from './role-assignment.js';

export type UserStatus = 'ACTIVE' | 'DISABLED';

/** Política de bloqueio por tentativas de login (ADR 0010). */
export const LOGIN_LOCK = { maxAttempts: 5, durationMs: 15 * 60_000 } as const;

/**
 * Usuário do sistema. Agregado: contém os papéis atribuídos a ele (`RoleAssignment`).
 *
 * O domínio nunca lê o relógio: quem precisa de "agora" o recebe por parâmetro, o que torna o bloqueio testável.
 * `version` é o contador do travamento otimista, mantido pelo repositório ao gravar.
 */
export class User {
  readonly #assignments: RoleAssignment[];
  #status: UserStatus;
  #passwordHash: PasswordHash;
  #failedLoginAttempts: number;
  #lockedUntil: Date | null;
  #lastLoginAt: Date | null;

  private constructor(
    readonly id: UserId,
    readonly organizationId: OrganizationId,
    readonly email: Email,
    passwordHash: PasswordHash,
    status: UserStatus,
    failedLoginAttempts: number,
    lockedUntil: Date | null,
    lastLoginAt: Date | null,
    assignments: readonly RoleAssignment[],
    readonly version: number,
  ) {
    this.#status = status;
    this.#passwordHash = passwordHash;
    this.#failedLoginAttempts = failedLoginAttempts;
    this.#lockedUntil = lockedUntil;
    this.#lastLoginAt = lastLoginAt;
    this.#assignments = [...assignments];
  }

  static register(input: {
    id: UserId;
    organizationId: OrganizationId;
    email: Email;
    passwordHash: PasswordHash;
  }): User {
    return new User(
      input.id,
      input.organizationId,
      input.email,
      input.passwordHash,
      'ACTIVE',
      0,
      null,
      null,
      [],
      0,
    );
  }

  static restore(input: {
    id: UserId;
    organizationId: OrganizationId;
    email: Email;
    passwordHash: PasswordHash;
    status: UserStatus;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    lastLoginAt: Date | null;
    assignments: readonly RoleAssignment[];
    version: number;
  }): User {
    return new User(
      input.id,
      input.organizationId,
      input.email,
      input.passwordHash,
      input.status,
      input.failedLoginAttempts,
      input.lockedUntil,
      input.lastLoginAt,
      input.assignments,
      input.version,
    );
  }

  get status(): UserStatus {
    return this.#status;
  }
  get passwordHash(): PasswordHash {
    return this.#passwordHash;
  }
  get failedLoginAttempts(): number {
    return this.#failedLoginAttempts;
  }
  get lockedUntil(): Date | null {
    return this.#lockedUntil;
  }
  get lastLoginAt(): Date | null {
    return this.#lastLoginAt;
  }
  /** Cópia: quem recebe não altera a lista interna. */
  get assignments(): readonly RoleAssignment[] {
    return [...this.#assignments];
  }

  /** `congregationId` nulo = o papel vale para a igreja toda. */
  assignRole(
    roleId: RoleId,
    congregationId: CongregationId | null = null,
  ): RoleAssignment {
    const assignment = RoleAssignment.create({ roleId, congregationId });

    if (this.#assignments.some((existing) => existing.equals(assignment))) {
      throw new RoleAlreadyAssignedError();
    }
    this.#assignments.push(assignment);
    return assignment;
  }

  /** Remove a atribuição exata (papel + escopo). Lança `AssignmentNotFoundError` se o usuário não a tem. */
  revokeRole(roleId: RoleId, congregationId: CongregationId | null): void {
    const target = RoleAssignment.create({ roleId, congregationId });
    const index = this.#assignments.findIndex((a) => a.equals(target));
    if (index === -1) throw new AssignmentNotFoundError();
    this.#assignments.splice(index, 1);
  }

  /** Desativa a conta (não entra mais). Idempotente. Quem chama revoga as sessões abertas. */
  disable(): void {
    this.#status = 'DISABLED';
  }

  enable(): void {
    this.#status = 'ACTIVE';
  }

  /**
   * Conta como Administrador da igreja: está ATIVO e tem o papel de Administrador para a igreja TODA. É o que a
   * regra "a igreja nunca fica sem Administrador" (ADR 0014) conta.
   */
  isActiveAdministrator(administratorRoleId: RoleId): boolean {
    return (
      this.#status === 'ACTIVE' &&
      this.#assignments.some(
        (a) => a.roleId === administratorRoleId && a.isOrganizationWide,
      )
    );
  }

  isLockedAt(now: Date): boolean {
    return (
      this.#lockedUntil !== null && now.getTime() < this.#lockedUntil.getTime()
    );
  }

  canAuthenticateAt(now: Date): boolean {
    return this.status === 'ACTIVE' && !this.isLockedAt(now);
  }

  recordFailedLogin(now: Date): void {
    // Tentativas durante o bloqueio não o prolongam nem acumulam.
    if (this.isLockedAt(now)) return;

    // Um bloqueio que já expirou zera a contagem: recomeça do 1.
    if (this.#lockedUntil !== null) {
      this.#failedLoginAttempts = 0;
      this.#lockedUntil = null;
    }

    this.#failedLoginAttempts += 1;
    if (this.#failedLoginAttempts >= LOGIN_LOCK.maxAttempts) {
      this.#lockedUntil = new Date(now.getTime() + LOGIN_LOCK.durationMs);
    }
  }

  recordSuccessfulLogin(now: Date): void {
    this.#failedLoginAttempts = 0;
    this.#lockedUntil = null;
    this.#lastLoginAt = now;
  }

  /** Usado na troca de senha e no re-hash após um login (parâmetros do argon2 endurecidos). */
  changePasswordHash(passwordHash: PasswordHash): void {
    this.#passwordHash = passwordHash;
  }
}
