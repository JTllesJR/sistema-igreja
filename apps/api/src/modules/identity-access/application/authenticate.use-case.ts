import type { Clock } from '../../../shared/application/clock.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { Email } from '../domain/email.js';
import { InvalidCredentialsError } from '../domain/errors.js';
import { SessionFamilyId, SessionId } from '../domain/ids.js';
import { PlainPassword } from '../domain/plain-password.js';
import type { RoleRepository } from '../domain/role.repository.js';
import { Session, type SessionPolicy } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { UserRepository } from '../domain/user.repository.js';
import type { AccessTokenSigner } from './access-token-signer.js';
import type { PasswordHasher } from './password-hasher.js';
import type { RefreshTokenCodec } from './refresh-token-codec.js';
import { updateUser } from './update-user.js';
import { type AuthenticationView, toCurrentUserView } from './views.js';

export interface AuthenticateCommand {
  email: string;
  password: string;
}

/**
 * UC-01 (entrar). Toda falha vira o MESMO erro (`InvalidCredentialsError`): e-mail inexistente, senha errada,
 * conta bloqueada, conta desativada e até dados malformados. Quem tenta adivinhar não aprende nada.
 */
export class AuthenticateUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly signer: AccessTokenSigner,
    private readonly codec: RefreshTokenCodec,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly sessionPolicy: SessionPolicy,
  ) {}

  async execute(command: AuthenticateCommand): Promise<AuthenticationView> {
    const { email, password } = parseCredentials(command);
    const now = this.clock.now();

    const found = await this.users.findByEmail(email);
    if (!found) {
      // Gasta o tempo de uma verificação real: responder mais rápido revelaria quais e-mails existem.
      await this.hasher.simulateVerification(password);
      throw new InvalidCredentialsError();
    }

    // Bloqueada ou desativada: nem verifica a senha (não adianta acertar, e não ajuda a adivinhar).
    if (!found.canAuthenticateAt(now)) throw new InvalidCredentialsError();

    if (!(await this.hasher.verify(password, found.passwordHash))) {
      await updateUser(this.users, found.id, (user) =>
        user.recordFailedLogin(now),
      );
      throw new InvalidCredentialsError();
    }

    // Parâmetros do hash ficaram para trás? Aproveita que temos a senha em mãos e re-hasha.
    const rehashed = this.hasher.needsRehash(found.passwordHash)
      ? await this.hasher.hash(password)
      : null;
    const user = await updateUser(this.users, found.id, (loaded) => {
      loaded.recordSuccessfulLogin(now);
      if (rehashed) loaded.changePasswordHash(rehashed);
    });

    const refresh = this.codec.generate();
    const session = Session.start({
      id: SessionId.of(this.ids.next()),
      organizationId: user.organizationId,
      userId: user.id,
      familyId: SessionFamilyId.of(this.ids.next()),
      tokenHash: refresh.hash,
      now,
      policy: this.sessionPolicy,
    });
    await this.sessions.add(session);

    const access = await this.signer.sign(
      {
        userId: user.id,
        organizationId: user.organizationId,
        sessionId: session.id,
      },
      now,
    );
    const roles = await this.roles.findByIds(
      user.assignments.map((a) => a.roleId),
    );

    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken: refresh.token,
      refreshTokenExpiresAt: session.expiresAt,
      user: toCurrentUserView(user, roles),
    };
  }
}

/** Dados malformados não são "erro de validação" no login: viram credenciais inválidas, sem dar pistas. */
function parseCredentials(command: AuthenticateCommand): {
  email: Email;
  password: PlainPassword;
} {
  try {
    const email = Email.create(command.email);
    return { email, password: PlainPassword.create(command.password, email) };
  } catch (error) {
    if (error instanceof ValidationError) throw new InvalidCredentialsError();
    throw error;
  }
}
