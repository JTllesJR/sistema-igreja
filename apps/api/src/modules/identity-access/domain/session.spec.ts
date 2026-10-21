import { describe, expect, it } from 'vitest';
import { SessionInvalidError } from './errors.js';
import { DEFAULT_SESSION_POLICY, Session } from './session.js';
import {
  DAY,
  NOW,
  after,
  familyId,
  orgId,
  sessionId,
  userId,
} from './testing/fixtures.js';

const policy = { idleMs: 30 * DAY, absoluteMs: 90 * DAY };

function aSession(at: Date = NOW): Session {
  return Session.start({
    id: sessionId(1),
    organizationId: orgId(),
    userId: userId(),
    familyId: familyId(),
    tokenHash: 'a'.repeat(64),
    now: at,
    policy,
  });
}

function rotate(session: Session, at: Date, n = 2) {
  return session.rotate({
    nextId: sessionId(n),
    nextTokenHash: String(n).repeat(64),
    now: at,
    policy,
  });
}

describe('Session', () => {
  describe('início', () => {
    it('nasce ativa, expira após o prazo ocioso e marca o início da família', () => {
      const session = aSession();

      expect(session.state(NOW)).toBe('ACTIVE');
      expect(session.expiresAt).toEqual(after(NOW, 30 * DAY));
      expect(session.familyStartedAt).toEqual(NOW);
    });

    it('a política padrão é 30 dias deslizantes e teto de 90 (ADR 0010)', () => {
      expect(DEFAULT_SESSION_POLICY).toEqual({
        idleMs: 30 * DAY,
        absoluteMs: 90 * DAY,
      });
    });
  });

  describe('estado', () => {
    it('fica ativa até o instante de expiração e expirada a partir dele', () => {
      const session = aSession();

      expect(session.state(after(NOW, 30 * DAY - 1))).toBe('ACTIVE');
      expect(session.state(after(NOW, 30 * DAY))).toBe('EXPIRED');
    });

    it('revogada, deixa de ser ativa', () => {
      expect(aSession().revoke(after(NOW, DAY)).state(after(NOW, DAY))).toBe(
        'REVOKED',
      );
    });

    it('revogar de novo mantém o primeiro instante de revogação', () => {
      const once = aSession().revoke(after(NOW, DAY));
      const twice = once.revoke(after(NOW, 2 * DAY));

      expect(twice.revokedAt).toEqual(after(NOW, DAY));
    });

    it('a sessão antiga, depois da rotação, passa a ROTATED', () => {
      const { previous } = rotate(aSession(), after(NOW, DAY));

      expect(previous.state(after(NOW, DAY))).toBe('ROTATED');
    });

    it('revogada vence rotacionada (a família inteira morreu)', () => {
      const { previous } = rotate(aSession(), after(NOW, DAY));

      expect(
        previous.revoke(after(NOW, 2 * DAY)).state(after(NOW, 2 * DAY)),
      ).toBe('REVOKED');
    });
  });

  describe('rotação', () => {
    it('gera a próxima sessão na mesma família e para o mesmo usuário, com novo id e hash', () => {
      const session = aSession();

      const { next } = rotate(session, after(NOW, DAY), 2);

      expect(next.id).toBe(sessionId(2));
      expect(next.familyId).toBe(session.familyId);
      expect(next.userId).toBe(session.userId);
      expect(next.organizationId).toBe(session.organizationId);
      expect(next.tokenHash).toBe('2'.repeat(64));
      expect(next.state(after(NOW, DAY))).toBe('ACTIVE');
    });

    it('o prazo ocioso é renovado a cada rotação (deslizante)', () => {
      const { next } = rotate(aSession(), after(NOW, 20 * DAY));

      expect(next.expiresAt).toEqual(after(NOW, 50 * DAY));
    });

    it('o teto absoluto desde o início da família limita a nova validade', () => {
      // Uma sessão só chega ao dia 75 se foi renovada a tempo: dia 0 -> 25 -> 50 -> 75.
      const day25 = rotate(aSession(), after(NOW, 25 * DAY), 2).next;
      const day50 = rotate(day25, after(NOW, 50 * DAY), 3).next;
      expect(day50.expiresAt).toEqual(after(NOW, 80 * DAY)); // 50 + 30, ainda abaixo do teto

      const { next } = rotate(day50, after(NOW, 75 * DAY), 4);

      // 75 + 30 = 105 dias, mas a família só pode viver até o dia 90.
      expect(next.expiresAt).toEqual(after(NOW, 90 * DAY));
      expect(next.familyStartedAt).toEqual(NOW);
    });

    it.each([
      ['expirada', (s: Session) => s, after(NOW, 31 * DAY)],
      ['revogada', (s: Session) => s.revoke(NOW), NOW],
      ['já rotacionada', (s: Session) => rotate(s, NOW).previous, NOW],
    ])('não rotaciona uma sessão %s', (_nome, prepare, at) => {
      expect(() => rotate(prepare(aSession()), at)).toThrow(
        SessionInvalidError,
      );
    });
  });
});
