import type { Clock } from '../../../shared/application/clock.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { CurrentPasswordIncorrectError } from '../domain/errors.js';
import { SessionId } from '../domain/ids.js';
import type { Email } from '../domain/email.js';
import { PlainPassword } from '../domain/plain-password.js';
import type { SessionFamilyId } from '../domain/ids.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import { loadActiveUser } from './load-user.js';
import type { PasswordHasher } from './password-hasher.js';
import { updateUser } from './update-user.js';

export interface ChangeOwnPasswordCommand {
  currentPassword: string;
  newPassword: string;
  /** Sessão do dispositivo atual (vem do token de acesso): é a única que continua válida depois da troca. */
  currentSessionId?: string;
}

/**
 * UC-18: o usuário troca a própria senha. Exige a senha atual e revoga as OUTRAS sessões.
 *
 * Errar a senha atual conta como tentativa de login (alimenta o bloqueio): sem isso, alguém com um token de acesso
 * roubado poderia adivinhar a senha por aqui, sem limite.
 */
export class ChangeOwnPasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: RequestContext,
    command: ChangeOwnPasswordCommand,
  ): Promise<void> {
    const user = await loadActiveUser(this.users, context);
    const now = this.clock.now();

    // Política da senha nova primeiro: erro de validação não tem efeito colateral.
    const newPassword = PlainPassword.create(command.newPassword, user.email);
    // Trocar pela mesma senha não troca nada: com uma senha temporária, anularia o objetivo da troca obrigatória.
    if (command.newPassword === command.currentPassword) {
      throw new ValidationError(
        'newPassword',
        'A nova senha deve ser diferente da atual.',
      );
    }

    // Conta bloqueada: nem verifica (a resposta é a mesma de senha errada).
    if (user.isLockedAt(now)) throw new CurrentPasswordIncorrectError();

    const current = tryPassword(command.currentPassword, user.email);
    const matches = current
      ? await this.hasher.verify(current, user.passwordHash)
      : false;
    if (!matches) {
      await updateUser(this.users, user.id, (loaded) =>
        loaded.recordFailedLogin(now),
      );
      throw new CurrentPasswordIncorrectError();
    }

    const newHash = await this.hasher.hash(newPassword);
    await updateUser(this.users, user.id, (loaded) =>
      loaded.choosePassword(newHash),
    );

    await this.sessions.revokeAllForUser(user.id, now, {
      exceptFamilyId: await this.familyOf(command.currentSessionId, user.id),
    });
  }

  /** Só preserva a família se a sessão informada existir e for DESTE usuário. */
  private async familyOf(
    sessionId: string | undefined,
    userId: string,
  ): Promise<SessionFamilyId | undefined> {
    if (!sessionId) return undefined;
    const session = await this.sessions.findById(SessionId.of(sessionId));
    return session && session.userId === userId ? session.familyId : undefined;
  }
}

function tryPassword(raw: string, email: Email): PlainPassword | null {
  try {
    return PlainPassword.create(raw, email);
  } catch (error) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}
