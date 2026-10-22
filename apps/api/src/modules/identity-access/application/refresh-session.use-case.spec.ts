import { describe, expect, it } from 'vitest';
import { Email } from '../domain/email.js';
import {
  SessionInvalidError,
  SessionReuseDetectedError,
} from '../domain/errors.js';
import { DAY, NOW, after } from '../domain/testing/fixtures.js';
import { User } from '../domain/user.js';
import { anAuthBed } from './testing/test-bed.js';

describe('RefreshSessionUseCase (UC-01, renovar)', () => {
  it('troca o token: devolve tokens novos e a sessão antiga passa a ROTATED', async () => {
    const bed = await anAuthBed();
    const login = await bed.login();

    const renewed = await bed.refresh.execute({
      refreshToken: login.refreshToken,
    });

    expect(renewed.refreshToken).not.toBe(login.refreshToken);
    expect(renewed.accessToken).not.toBe(login.accessToken);
    const old = await bed.sessions.findByTokenHash(
      bed.codec.hashOf(login.refreshToken),
    );
    const current = await bed.sessions.findByTokenHash(
      bed.codec.hashOf(renewed.refreshToken),
    );
    expect(old?.state(NOW)).toBe('ROTATED');
    expect(current?.state(NOW)).toBe('ACTIVE');
    expect(current?.familyId).toBe(old?.familyId);
  });

  it('o novo token também pode ser renovado (cadeia)', async () => {
    const bed = await anAuthBed();
    const login = await bed.login();

    const second = await bed.refresh.execute({
      refreshToken: login.refreshToken,
    });
    const third = await bed.refresh.execute({
      refreshToken: second.refreshToken,
    });

    expect(third.refreshToken).not.toBe(second.refreshToken);
  });

  it('o prazo é deslizante, mas respeita o teto de 90 dias desde o login', async () => {
    const bed = await anAuthBed();
    let token = (await bed.login()).refreshToken;
    const expirations: Date[] = [];

    // Renova a cada 25 dias: dias 25, 50 e 75. Cada renovação usa o token mais recente.
    for (let i = 0; i < 3; i++) {
      bed.clock.advance(25 * DAY);
      const renewed = await bed.refresh.execute({ refreshToken: token });
      token = renewed.refreshToken;
      expirations.push(renewed.refreshTokenExpiresAt);
    }

    // Deslizante: dia 25 + 30 = 55, dia 50 + 30 = 80. No dia 75, 75 + 30 = 105, mas a família vive até o dia 90.
    expect(expirations).toEqual([
      after(NOW, 55 * DAY),
      after(NOW, 80 * DAY),
      after(NOW, 90 * DAY),
    ]);
  });

  describe('token inválido', () => {
    it('desconhecido', async () => {
      const bed = await anAuthBed();

      await expect(
        bed.refresh.execute({ refreshToken: 'token-que-nunca-existiu' }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('expirado (30 dias sem usar)', async () => {
      const bed = await anAuthBed();
      const login = await bed.login();
      bed.clock.advance(30 * DAY);

      await expect(
        bed.refresh.execute({ refreshToken: login.refreshToken }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('revogado pelo logout', async () => {
      const bed = await anAuthBed();
      const login = await bed.login();
      await bed.logout.execute({ refreshToken: login.refreshToken });

      await expect(
        bed.refresh.execute({ refreshToken: login.refreshToken }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('de um usuário que foi desativado depois do login: revoga a família', async () => {
      const bed = await anAuthBed();
      const login = await bed.login();
      const stored = (await bed.users.findById(bed.admin.userId)) as User;
      const disabled = User.restore({
        id: stored.id,
        organizationId: stored.organizationId,
        email: Email.create(stored.email.value),
        passwordHash: stored.passwordHash,
        status: 'DISABLED',
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        assignments: stored.assignments,
        version: stored.version,
      });
      await bed.users.save(disabled);

      await expect(
        bed.refresh.execute({ refreshToken: login.refreshToken }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
      const session = await bed.sessions.findByTokenHash(
        bed.codec.hashOf(login.refreshToken),
      );
      expect(session?.state(NOW)).toBe('REVOKED');
    });
  });

  describe('reuso de um token já trocado (indício de roubo)', () => {
    it('é detectado e a família inteira é revogada, inclusive o token legítimo mais novo', async () => {
      const bed = await anAuthBed();
      const login = await bed.login();
      const renewed = await bed.refresh.execute({
        refreshToken: login.refreshToken,
      });

      await expect(
        bed.refresh.execute({ refreshToken: login.refreshToken }),
      ).rejects.toBeInstanceOf(SessionReuseDetectedError);

      // O token mais novo (que o dono legítimo tinha) também morreu: ele precisa entrar de novo.
      await expect(
        bed.refresh.execute({ refreshToken: renewed.refreshToken }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });

    it('não afeta as sessões de outros dispositivos do mesmo usuário', async () => {
      const bed = await anAuthBed();
      const phone = await bed.login();
      const notebook = await bed.login();
      await bed.refresh.execute({ refreshToken: phone.refreshToken });

      await bed.refresh
        .execute({ refreshToken: phone.refreshToken })
        .catch(() => undefined);

      await expect(
        bed.refresh.execute({ refreshToken: notebook.refreshToken }),
      ).resolves.toBeDefined();
    });

    it('duas renovações simultâneas com o mesmo token: só uma vence e a família é revogada', async () => {
      const bed = await anAuthBed();
      const login = await bed.login();

      const results = await Promise.allSettled([
        bed.refresh.execute({ refreshToken: login.refreshToken }),
        bed.refresh.execute({ refreshToken: login.refreshToken }),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(SessionReuseDetectedError);
      // Nenhum dos dois tokens novos continua válido: a corrida foi tratada como roubo.
      const winner = results.find((r) => r.status === 'fulfilled');
      await expect(
        bed.refresh.execute({
          refreshToken: (
            winner as PromiseFulfilledResult<{ refreshToken: string }>
          ).value.refreshToken,
        }),
      ).rejects.toBeInstanceOf(SessionInvalidError);
    });
  });
});
