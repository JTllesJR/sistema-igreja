import { beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import { Email } from '../email.js';
import {
  EmailAlreadyRegisteredError,
  LastAdministratorError,
  UserNotFoundError,
} from '../errors.js';
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
    mustChangePassword: user.mustChangePassword,
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
 * Requisitos do ambiente (por causa de chaves estrangeiras no banco real): devem existir as organizações `orgId(1)` e
 * `orgId(2)`,
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

    it('grava e devolve a troca obrigatória de senha, ligada e desligada', async () => {
      const user = User.register({
        id: userId(1),
        organizationId: orgId(1),
        email: anEmail('nova@igreja.com'),
        passwordHash: PasswordHash.of(A_PASSWORD_HASH),
        mustChangePassword: true,
      });
      await repository.add(user);
      expect((await repository.findById(userId(1)))?.mustChangePassword).toBe(
        true,
      );

      const loaded = (await repository.findById(userId(1))) as User;
      loaded.choosePassword(PasswordHash.of(A_PASSWORD_HASH));
      await repository.save(loaded);
      expect((await repository.findById(userId(1)))?.mustChangePassword).toBe(
        false,
      );

      const again = (await repository.findById(userId(1))) as User;
      again.issueTemporaryPassword(PasswordHash.of(A_PASSWORD_HASH));
      await repository.save(again);
      expect((await repository.findById(userId(1)))?.mustChangePassword).toBe(
        true,
      );
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

    describe('listByOrganization', () => {
      it('devolve os usuários DA organização, com as atribuições, e nenhum de outra', async () => {
        const first = aUser(1);
        first.assignRole(roleId(1));
        first.assignRole(roleId(2), congId(1));
        await repository.add(first);
        await repository.add(aUser(2));
        await repository.add(
          User.register({
            id: userId(3),
            organizationId: orgId(2),
            email: anEmail('outra-igreja@igreja.com'),
            passwordHash: PasswordHash.of(A_PASSWORD_HASH),
          }),
        );

        const found = await repository.listByOrganization(orgId(1));

        expect(found.map((u) => u.id).sort()).toEqual([userId(1), userId(2)]);
        const loaded = found.find((u) => u.id === userId(1)) as User;
        expect(snapshot(loaded).assignments).toEqual(
          snapshot(first).assignments,
        );
        await expect(
          repository.listByOrganization(orgId(2)),
        ).resolves.toHaveLength(1);
      });

      it('organização sem usuários devolve lista vazia', async () => {
        await expect(repository.listByOrganization(orgId(1))).resolves.toEqual(
          [],
        );
      });
    });

    describe('findManyByIds', () => {
      it('devolve só os pedidos que existem NESTA organização, ignorando desconhecidos e os de outra igreja', async () => {
        await repository.add(aUser(1));
        await repository.add(aUser(2));
        await repository.add(
          User.register({
            id: userId(3),
            organizationId: orgId(2),
            email: anEmail('outra-igreja@igreja.com'),
            passwordHash: PasswordHash.of(A_PASSWORD_HASH),
          }),
        );

        const found = await repository.findManyByIds(orgId(1), [
          userId(1),
          userId(3),
          userId(404),
        ]);

        expect(found.map((u) => u.id)).toEqual([userId(1)]);
        await expect(
          repository.findManyByIds(orgId(2), [userId(1), userId(3)]),
        ).resolves.toHaveLength(1);
      });

      it('lista vazia devolve vazio, e o resultado traz e-mail e situação', async () => {
        const user = aUser(1);
        user.disable();
        await repository.add(user);

        await expect(repository.findManyByIds(orgId(1), [])).resolves.toEqual(
          [],
        );
        const [found] = await repository.findManyByIds(orgId(1), [userId(1)]);
        expect(found?.email.value).toBe(user.email.value);
        expect(found?.status).toBe('DISABLED');
      });
    });

    it('save grava a revogação de uma atribuição e a desativação do usuário', async () => {
      const user = aUser(1);
      user.assignRole(roleId(1));
      user.assignRole(roleId(2), congId(1));
      await repository.add(user);
      const loaded = (await repository.findById(userId(1))) as User;

      loaded.revokeRole(roleId(2), congId(1));
      loaded.disable();
      await repository.save(loaded);

      const again = (await repository.findById(userId(1))) as User;
      expect(again.status).toBe('DISABLED');
      expect(
        again.assignments.map((a) => [a.roleId, a.congregationId]),
      ).toEqual([[roleId(1), null]]);
      expect(again.version).toBe(1);
    });

    describe('saveGuardingLastAdministrator (a igreja nunca fica sem Administrador ativo)', () => {
      const ADMIN = roleId(1);
      const anAdmin = (n: number) => {
        const user = aUser(n);
        user.assignRole(ADMIN);
        return user;
      };
      const load = async (n: number) =>
        (await repository.findById(userId(n))) as User;

      it('recusa tirar o papel do ÚNICO administrador ativo e não grava nada', async () => {
        await repository.add(anAdmin(1));
        const user = await load(1);
        user.revokeRole(ADMIN, null);

        await expect(
          repository.saveGuardingLastAdministrator(user, ADMIN),
        ).rejects.toBeInstanceOf(LastAdministratorError);

        const stored = await load(1);
        expect(stored.assignments).toHaveLength(1);
        expect(stored.version).toBe(0);
      });

      it('recusa desativar o único administrador ativo', async () => {
        await repository.add(anAdmin(1));
        const user = await load(1);
        user.disable();

        await expect(
          repository.saveGuardingLastAdministrator(user, ADMIN),
        ).rejects.toBeInstanceOf(LastAdministratorError);
        expect((await load(1)).status).toBe('ACTIVE');
      });

      it('permite quando OUTRO administrador ativo continua existindo', async () => {
        await repository.add(anAdmin(1));
        await repository.add(anAdmin(2));
        const user = await load(1);
        user.revokeRole(ADMIN, null);

        await repository.saveGuardingLastAdministrator(user, ADMIN);

        expect((await load(1)).assignments).toHaveLength(0);
        expect((await load(1)).version).toBe(1);
      });

      it('um administrador DESATIVADO não conta como o "outro"', async () => {
        const disabled = anAdmin(2);
        disabled.disable();
        await repository.add(anAdmin(1));
        await repository.add(disabled);
        const user = await load(1);
        user.revokeRole(ADMIN, null);

        await expect(
          repository.saveGuardingLastAdministrator(user, ADMIN),
        ).rejects.toBeInstanceOf(LastAdministratorError);
      });

      it('um Administrador só de uma congregação NÃO conta como o "outro"', async () => {
        const scoped = aUser(2);
        scoped.assignRole(ADMIN, congId(1));
        await repository.add(anAdmin(1));
        await repository.add(scoped);
        const user = await load(1);
        user.disable();

        await expect(
          repository.saveGuardingLastAdministrator(user, ADMIN),
        ).rejects.toBeInstanceOf(LastAdministratorError);
      });

      it('uma alteração que mantém o usuário administrador passa mesmo sendo o único', async () => {
        await repository.add(anAdmin(1));
        const user = await load(1);
        user.assignRole(roleId(2), congId(1));

        await repository.saveGuardingLastAdministrator(user, ADMIN);

        expect((await load(1)).assignments).toHaveLength(2);
      });

      it('mantém o travamento otimista: versão desatualizada é conflito e usuário inexistente é NotFound', async () => {
        await repository.add(anAdmin(1));
        await repository.add(anAdmin(2));
        const stale = await load(1);
        const fresh = await load(1);
        fresh.assignRole(roleId(2), congId(1));
        await repository.save(fresh);
        stale.revokeRole(ADMIN, null);

        await expect(
          repository.saveGuardingLastAdministrator(stale, ADMIN),
        ).rejects.toBeInstanceOf(ConcurrencyConflictError);
        await expect(
          repository.saveGuardingLastAdministrator(aUser(9), ADMIN),
        ).rejects.toBeInstanceOf(UserNotFoundError);
      });

      it('um papel comum na igreja toda NÃO conta como o "outro" administrador', async () => {
        const secretary = aUser(2);
        secretary.assignRole(roleId(2));
        await repository.add(anAdmin(1));
        await repository.add(secretary);
        const user = await load(1);
        user.revokeRole(ADMIN, null);

        await expect(
          repository.saveGuardingLastAdministrator(user, ADMIN),
        ).rejects.toBeInstanceOf(LastAdministratorError);
      });

      it('versão desatualizada vence a regra: o erro é de conflito mesmo quando a regra também recusaria', async () => {
        await repository.add(anAdmin(1));
        const stale = await load(1);
        const fresh = await load(1);
        fresh.assignRole(roleId(2), congId(1));
        await repository.save(fresh);
        stale.revokeRole(ADMIN, null);

        await expect(
          repository.saveGuardingLastAdministrator(stale, ADMIN),
        ).rejects.toBeInstanceOf(ConcurrencyConflictError);
      });

      it('DUAS remoções simultâneas dos dois únicos administradores: uma passa e a outra é recusada', async () => {
        await repository.add(anAdmin(1));
        await repository.add(anAdmin(2));

        // Repetido: uma única tentativa pode, por sorte, rodar uma transação inteira antes da outra e passar mesmo sem
        // a proteção. Em vários rounds o entrelaçamento acontece e a ausência da trava é pega.
        for (let round = 0; round < 20; round++) {
          const first = await load(1);
          const second = await load(2);
          first.revokeRole(ADMIN, null);
          second.revokeRole(ADMIN, null);

          const results = await Promise.allSettled([
            repository.saveGuardingLastAdministrator(first, ADMIN),
            repository.saveGuardingLastAdministrator(second, ADMIN),
          ]);

          expect(results.map((r) => r.status).sort()).toEqual([
            'fulfilled',
            'rejected',
          ]);
          const rejected = results.find((r) => r.status === 'rejected');
          expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
            LastAdministratorError,
          );
          const stillAdmin = [await load(1), await load(2)].filter((u) =>
            u.isActiveAdministrator(ADMIN),
          );
          expect(stillAdmin).toHaveLength(1);

          // Devolve o papel a quem o perdeu, para o próximo round começar com dois administradores.
          for (const n of [1, 2]) {
            const user = await load(n);
            if (!user.isActiveAdministrator(ADMIN)) {
              user.assignRole(ADMIN);
              await repository.save(user);
            }
          }
        }
      });
    });
  });
}
