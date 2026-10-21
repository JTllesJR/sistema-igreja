import { beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import { Session } from '../session.js';
import type { SessionRepository } from '../session.repository.js';
import {
  DAY,
  NOW,
  after,
  familyId,
  orgId,
  sessionId,
  userId,
} from './fixtures.js';

const policy = { idleMs: 30 * DAY, absoluteMs: 90 * DAY };

function aSession(n: number, family = 1, user = 1): Session {
  return Session.start({
    id: sessionId(n),
    organizationId: orgId(1),
    userId: userId(user),
    familyId: familyId(family),
    tokenHash: String(n).padStart(64, '0'),
    now: NOW,
    policy,
  });
}

function snapshot(session: Session) {
  return {
    id: session.id,
    userId: session.userId,
    familyId: session.familyId,
    tokenHash: session.tokenHash,
    createdAt: session.createdAt.toISOString(),
    familyStartedAt: session.familyStartedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    rotatedAt: session.rotatedAt?.toISOString() ?? null,
    revokedAt: session.revokedAt?.toISOString() ?? null,
  };
}

/**
 * Contrato que TODA implementação de `SessionRepository` precisa cumprir (em memória e PostgreSQL).
 *
 * Requisitos do ambiente: devem existir a organização `orgId(1)` e os usuários `userId(1)` e `userId(2)` dela.
 * `makeRepository` deve devolver um repositório SEM sessões a cada chamada.
 */
export function describeSessionRepositoryContract(
  label: string,
  makeRepository: () => SessionRepository | Promise<SessionRepository>,
): void {
  describe(`SessionRepository (${label})`, () => {
    let repository: SessionRepository;

    beforeEach(async () => {
      repository = await makeRepository();
    });

    it('add + findByTokenHash/findById devolvem a sessão completa', async () => {
      const session = aSession(1);
      await repository.add(session);

      const byHash = await repository.findByTokenHash(session.tokenHash);
      const byId = await repository.findById(sessionId(1));

      expect(snapshot(byHash as Session)).toEqual(snapshot(session));
      expect(snapshot(byId as Session)).toEqual(snapshot(session));
    });

    it('devolve null para hash ou id desconhecidos', async () => {
      await expect(
        repository.findByTokenHash('f'.repeat(64)),
      ).resolves.toBeNull();
      await expect(repository.findById(sessionId(99))).resolves.toBeNull();
    });

    it('rotate grava a anterior como trocada e a próxima como ativa, na mesma família', async () => {
      const first = aSession(1);
      await repository.add(first);
      const { previous, next } = first.rotate({
        nextId: sessionId(2),
        nextTokenHash: String(2).padStart(64, '0'),
        now: after(NOW, DAY),
        policy,
      });

      await repository.rotate(previous, next);

      const storedPrevious = (await repository.findById(
        sessionId(1),
      )) as Session;
      const storedNext = (await repository.findById(sessionId(2))) as Session;
      expect(storedPrevious.state(after(NOW, DAY))).toBe('ROTATED');
      expect(storedNext.state(after(NOW, DAY))).toBe('ACTIVE');
      expect(storedNext.familyId).toBe(first.familyId);
    });

    it('duas trocas simultâneas da mesma sessão: só uma vence, a outra recebe conflito', async () => {
      const first = aSession(1);
      await repository.add(first);
      const attempt = (n: number) =>
        first.rotate({
          nextId: sessionId(n),
          nextTokenHash: String(n).padStart(64, '0'),
          now: after(NOW, DAY),
          policy,
        });

      const a = attempt(2);
      const b = attempt(3);
      const results = await Promise.allSettled([
        repository.rotate(a.previous, a.next),
        repository.rotate(b.previous, b.next),
      ]);

      const rejected = results.filter((r) => r.status === 'rejected');
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(ConcurrencyConflictError);
      // Só uma das duas sessões novas existe: o roubo não consegue duplicar a cadeia.
      const created = [
        await repository.findById(sessionId(2)),
        await repository.findById(sessionId(3)),
      ];
      expect(created.filter((s) => s !== null)).toHaveLength(1);
    });

    it('revokeFamily revoga toda a família (inclusive as trocadas) e não toca nas outras', async () => {
      const first = aSession(1, 1);
      await repository.add(first);
      const { previous, next } = first.rotate({
        nextId: sessionId(2),
        nextTokenHash: String(2).padStart(64, '0'),
        now: after(NOW, DAY),
        policy,
      });
      await repository.rotate(previous, next);
      await repository.add(aSession(3, 2)); // outra família

      await repository.revokeFamily(familyId(1), after(NOW, 2 * DAY));

      const at = after(NOW, 2 * DAY);
      expect(
        ((await repository.findById(sessionId(1))) as Session).state(at),
      ).toBe('REVOKED');
      expect(
        ((await repository.findById(sessionId(2))) as Session).state(at),
      ).toBe('REVOKED');
      expect(
        ((await repository.findById(sessionId(3))) as Session).state(at),
      ).toBe('ACTIVE');
    });

    it('revokeFamily é idempotente: mantém o primeiro instante de revogação', async () => {
      await repository.add(aSession(1));

      await repository.revokeFamily(familyId(1), after(NOW, DAY));
      await repository.revokeFamily(familyId(1), after(NOW, 5 * DAY));

      const stored = (await repository.findById(sessionId(1))) as Session;
      expect(stored.revokedAt).toEqual(after(NOW, DAY));
    });

    it('revokeAllForUser revoga todas as famílias do usuário, menos a indicada', async () => {
      await repository.add(aSession(1, 1, 1));
      await repository.add(aSession(2, 2, 1));
      await repository.add(aSession(3, 3, 2)); // outro usuário

      await repository.revokeAllForUser(userId(1), after(NOW, DAY), {
        exceptFamilyId: familyId(1),
      });

      const at = after(NOW, DAY);
      expect(
        ((await repository.findById(sessionId(1))) as Session).state(at),
      ).toBe('ACTIVE');
      expect(
        ((await repository.findById(sessionId(2))) as Session).state(at),
      ).toBe('REVOKED');
      expect(
        ((await repository.findById(sessionId(3))) as Session).state(at),
      ).toBe('ACTIVE');
    });

    it('revokeAllForUser sem exceção revoga todas as do usuário', async () => {
      await repository.add(aSession(1, 1, 1));
      await repository.add(aSession(2, 2, 1));

      await repository.revokeAllForUser(userId(1), after(NOW, DAY));

      const at = after(NOW, DAY);
      expect(
        ((await repository.findById(sessionId(1))) as Session).state(at),
      ).toBe('REVOKED');
      expect(
        ((await repository.findById(sessionId(2))) as Session).state(at),
      ).toBe('REVOKED');
    });
  });
}
