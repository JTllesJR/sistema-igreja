import { beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import { Email } from '../email.js';
import { EmailAlreadyRegisteredError, UserNotFoundError } from '../errors.js';
import { LOGIN_LOCK, User } from '../user.js';
import type { UserRepository } from '../user.repository.js';
import { PasswordHash } from '../password-hash.js';
import {
  A_PASSWORD_HASH,
  NOW,
  aUser,
  after,
  anEmail,
  congId,
  orgId,
  roleId,
  userId,
} from './fixtures.js';

function snapshot(user: User) {
  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email.value,
    passwordHash: user.passwordHash.value,
    status: user.status,
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    version: user.version,
    assignments: user.assignments
      .map((a) => ({ roleId: a.roleId, congregationId: a.congregationId }))
      .sort((a, b) =>
        `${a.roleId}${a.congregationId}`.localeCompare(
          `${b.roleId}${b.congregationId}`,
        ),
      ),
  };
}

/**
 * Contrato que TODA implementação de `UserRepository` precisa cumprir (em memória e PostgreSQL).
 *
 * Requisitos do ambiente (por causa de chaves estrangeiras no banco real): devem existir a organização `orgId(1)`,
 * os papéis `roleId(1)` e `roleId(2)` dessa organização e as congregações `congId(1)` e `congId(2)` dela.
 * `makeRepository` deve devolver um repositório SEM usuários a cada chamada.
 */
export function describeUserRepositoryContract(
  label: string,
  makeRepository: () => UserRepository | Promise<UserRepository>,
): void {
  describe(`UserRepository (${label})`, () => {
    let repository: UserRepository;

    beforeEach(async () => {
      repository = await makeRepository();
    });

    it('add + findById devolve o usuário com os dados e a versão 0', async () => {
      const user = aUser(1);
      await repository.add(user);

      const found = await repository.findById(userId(1));

      expect(found).not.toBeNull();
      expect(snapshot(found as User)).toEqual(snapshot(user));
      expect(found?.version).toBe(0);
    });

    it('findByEmail encontra pelo e-mail normalizado (caixa e espaços não importam)', async () => {
      await repository.add(aUser(1));

      const found = await repository.findByEmail(
        Email.create('  USUARIO1@igreja.com '),
      );

      expect(found?.id).toBe(userId(1));
    });

    it('devolve null para id ou e-mail desconhecidos', async () => {
      await expect(repository.findById(userId(99))).resolves.toBeNull();
      await expect(
        repository.findByEmail(anEmail('ninguem@igreja.com')),
      ).resolves.toBeNull();
    });

    it('preserva as atribuições de papel, para a igreja toda e por congregação', async () => {
      const user = aUser(1);
      user.assignRole(roleId(1));
      user.assignRole(roleId(2), congId(1));
      user.assignRole(roleId(2), congId(2));
      await repository.add(user);

      const found = (await repository.findById(userId(1))) as User;

      expect(snapshot(found).assignments).toEqual(snapshot(user).assignments);
      expect(found.assignments).toHaveLength(3);
    });

    it('devolve cópias independentes: alterar o lido não muda o armazenado sem salvar', async () => {
      await repository.add(aUser(1));

      const loaded = (await repository.findById(userId(1))) as User;
      loaded.assignRole(roleId(1));

      const again = (await repository.findById(userId(1))) as User;
      expect(again.assignments).toHaveLength(0);
    });

    it('save grava bloqueio, atribuições, senha e login, e incrementa a versão', async () => {
      await repository.add(aUser(1));
      const loaded = (await repository.findById(userId(1))) as User;
      for (let i = 0; i < LOGIN_LOCK.maxAttempts; i++)
        loaded.recordFailedLogin(NOW);
      loaded.assignRole(roleId(1));
      const newHash = PasswordHash.of(
        '$argon2id$v=19$m=19456,t=2,p=1$b3V0cm9zYWx0MTIzNDU2$b3V0cm9oYXNob3V0cm9oYXNob3V0cm9oYXNo',
      );
      loaded.changePasswordHash(newHash);

      await repository.save(loaded);

      const again = (await repository.findById(userId(1))) as User;
      expect(again.version).toBe(1);
      expect(again.failedLoginAttempts).toBe(LOGIN_LOCK.maxAttempts);
      expect(again.lockedUntil).toEqual(after(NOW, LOGIN_LOCK.durationMs));
      expect(again.assignments).toHaveLength(1);
      expect(again.passwordHash.equals(newHash)).toBe(true);

      again.recordSuccessfulLogin(after(NOW, 20 * 60_000));
      await repository.save(again);
      const last = (await repository.findById(userId(1))) as User;
      expect(last.version).toBe(2);
      expect(last.failedLoginAttempts).toBe(0);
      expect(last.lockedUntil).toBeNull();
      expect(last.lastLoginAt).toEqual(after(NOW, 20 * 60_000));
    });

    it('save com versão desatualizada falha com conflito e não sobrescreve', async () => {
      await repository.add(aUser(1));
      const first = (await repository.findById(userId(1))) as User;
      const second = (await repository.findById(userId(1))) as User;

      first.recordFailedLogin(NOW);
      await repository.save(first);

      second.assignRole(roleId(1));
      await expect(repository.save(second)).rejects.toBeInstanceOf(
        ConcurrencyConflictError,
      );

      const stored = (await repository.findById(userId(1))) as User;
      expect(stored.failedLoginAttempts).toBe(1);
      expect(stored.assignments).toHaveLength(0);
    });

    it('save de um usuário que nunca foi adicionado é rejeitado', async () => {
      await expect(repository.save(aUser(1))).rejects.toBeInstanceOf(
        UserNotFoundError,
      );
    });

    it('add com e-mail já cadastrado é rejeitado, mesmo com outra caixa e outro id', async () => {
      await repository.add(aUser(1));
      const clone = User.register({
        id: userId(2),
        organizationId: orgId(1),
        email: Email.create('USUARIO1@igreja.com'),
        passwordHash: PasswordHash.of(A_PASSWORD_HASH),
      });

      await expect(repository.add(clone)).rejects.toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );
      await expect(repository.findById(userId(2))).resolves.toBeNull();
    });
  });
}
