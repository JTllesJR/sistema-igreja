import { describe, expect, it } from 'vitest';
import { PasswordHash } from './password-hash.js';
import { RoleAlreadyAssignedError } from './errors.js';
import { LOGIN_LOCK, User } from './user.js';
import {
  A_PASSWORD_HASH,
  MINUTE,
  NOW,
  aUser,
  after,
  anEmail,
  congId,
  orgId,
  roleId,
  userId,
} from './testing/fixtures.js';

function failTimes(user: User, times: number, at: Date): void {
  for (let i = 0; i < times; i++) user.recordFailedLogin(at);
}

describe('User', () => {
  describe('registro', () => {
    it('nasce ativo, sem papéis, sem falhas e sem bloqueio', () => {
      const user = aUser();

      expect(user.status).toBe('ACTIVE');
      expect(user.assignments).toEqual([]);
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockedUntil).toBeNull();
      expect(user.lastLoginAt).toBeNull();
      expect(user.version).toBe(0);
    });
  });

  describe('atribuição de papéis', () => {
    it('atribui um papel para a igreja toda (sem congregação)', () => {
      const user = aUser();

      const assignment = user.assignRole(roleId(1));

      expect(assignment.isOrganizationWide).toBe(true);
      expect(user.assignments).toHaveLength(1);
    });

    it('atribui o mesmo papel restrito a congregações diferentes', () => {
      const user = aUser();

      user.assignRole(roleId(1), congId(1));
      user.assignRole(roleId(1), congId(2));

      expect(user.assignments).toHaveLength(2);
    });

    it('permite o mesmo papel na igreja toda e em uma congregação (escopos distintos)', () => {
      const user = aUser();

      user.assignRole(roleId(1));
      user.assignRole(roleId(1), congId(1));

      expect(user.assignments).toHaveLength(2);
    });

    it('rejeita a mesma atribuição repetida e não altera nada', () => {
      const user = aUser();
      user.assignRole(roleId(1), congId(1));

      expect(() => user.assignRole(roleId(1), congId(1))).toThrow(
        RoleAlreadyAssignedError,
      );
      expect(user.assignments).toHaveLength(1);
    });

    it('a lista exposta é uma cópia', () => {
      const user = aUser();
      user.assignRole(roleId(1));

      (user.assignments as unknown[]).pop();

      expect(user.assignments).toHaveLength(1);
    });
  });

  describe('bloqueio por falhas seguidas de login', () => {
    it(`${LOGIN_LOCK.maxAttempts - 1} falhas ainda não bloqueiam`, () => {
      const user = aUser();

      failTimes(user, LOGIN_LOCK.maxAttempts - 1, NOW);

      expect(user.failedLoginAttempts).toBe(LOGIN_LOCK.maxAttempts - 1);
      expect(user.isLockedAt(NOW)).toBe(false);
      expect(user.canAuthenticateAt(NOW)).toBe(true);
    });

    it('na falha de número 5 bloqueia por 15 minutos', () => {
      const user = aUser();

      failTimes(user, 5, NOW);

      expect(user.lockedUntil).toEqual(after(NOW, 15 * MINUTE));
      expect(user.isLockedAt(NOW)).toBe(true);
      expect(user.canAuthenticateAt(after(NOW, 14 * MINUTE))).toBe(false);
    });

    it('o bloqueio termina exatamente em lockedUntil', () => {
      const user = aUser();
      failTimes(user, 5, NOW);

      expect(user.isLockedAt(after(NOW, 15 * MINUTE))).toBe(false);
      expect(user.canAuthenticateAt(after(NOW, 15 * MINUTE))).toBe(true);
    });

    it('falha registrada durante o bloqueio não o prolonga nem acumula', () => {
      const user = aUser();
      failTimes(user, 5, NOW);
      const lockedUntil = user.lockedUntil;

      user.recordFailedLogin(after(NOW, 5 * MINUTE));

      expect(user.lockedUntil).toEqual(lockedUntil);
      expect(user.failedLoginAttempts).toBe(5);
    });

    it('depois que o bloqueio expira, a contagem recomeça do zero', () => {
      const user = aUser();
      failTimes(user, 5, NOW);
      const later = after(NOW, 16 * MINUTE);

      user.recordFailedLogin(later);

      expect(user.failedLoginAttempts).toBe(1);
      expect(user.lockedUntil).toBeNull();
      expect(user.canAuthenticateAt(later)).toBe(true);
    });

    it('um login bem-sucedido zera as falhas e registra o instante', () => {
      const user = aUser();
      failTimes(user, 3, NOW);

      user.recordSuccessfulLogin(after(NOW, MINUTE));

      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockedUntil).toBeNull();
      expect(user.lastLoginAt).toEqual(after(NOW, MINUTE));
    });
  });

  describe('autenticação possível', () => {
    it('usuário desativado não autentica', () => {
      const disabled = User.restore({
        id: userId(9),
        organizationId: orgId(),
        email: anEmail('inativo@igreja.com'),
        passwordHash: PasswordHash.of(A_PASSWORD_HASH),
        status: 'DISABLED',
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        assignments: [],
        version: 3,
      });

      expect(disabled.canAuthenticateAt(NOW)).toBe(false);
      expect(disabled.version).toBe(3);
    });
  });

  describe('troca de senha', () => {
    it('substitui o hash', () => {
      const user = aUser();
      const newHash = PasswordHash.of(
        '$argon2id$v=19$m=19456,t=2,p=1$b3V0cm9zYWx0MTIzNDU2$b3V0cm9oYXNob3V0cm9oYXNob3V0cm9oYXNo',
      );

      user.changePasswordHash(newHash);

      expect(user.passwordHash.equals(newHash)).toBe(true);
    });
  });

  it('a política de bloqueio é de 5 falhas e 15 minutos (ADR 0010)', () => {
    expect(LOGIN_LOCK).toEqual({ maxAttempts: 5, durationMs: 15 * MINUTE });
  });
});
