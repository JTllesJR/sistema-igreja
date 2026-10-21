import { describe, expect, it } from 'vitest';
import { SessionInvalidError } from '../domain/errors.js';
import { NOW } from '../domain/testing/fixtures.js';
import { anAuthBed } from './testing/test-bed.js';

describe('LogoutUseCase (UC-01, sair)', () => {
  it('revoga a família: nem o token atual nem os já trocados voltam a funcionar', async () => {
    const bed = await anAuthBed();
    const login = await bed.login();
    const renewed = await bed.refresh.execute({
      refreshToken: login.refreshToken,
    });

    await bed.logout.execute({ refreshToken: renewed.refreshToken });

    for (const token of [login.refreshToken, renewed.refreshToken]) {
      const session = await bed.sessions.findByTokenHash(
        bed.codec.hashOf(token),
      );
      expect(session?.state(NOW)).toBe('REVOKED');
    }
    await expect(
      bed.refresh.execute({ refreshToken: renewed.refreshToken }),
    ).rejects.toBeInstanceOf(SessionInvalidError);
  });

  it('não encerra as sessões de outros dispositivos', async () => {
    const bed = await anAuthBed();
    const phone = await bed.login();
    const notebook = await bed.login();

    await bed.logout.execute({ refreshToken: phone.refreshToken });

    await expect(
      bed.refresh.execute({ refreshToken: notebook.refreshToken }),
    ).resolves.toBeDefined();
  });

  it('é idempotente: sair duas vezes não dá erro', async () => {
    const bed = await anAuthBed();
    const login = await bed.login();

    await bed.logout.execute({ refreshToken: login.refreshToken });

    await expect(
      bed.logout.execute({ refreshToken: login.refreshToken }),
    ).resolves.toBeUndefined();
  });

  it('token desconhecido não dá erro nem revela nada', async () => {
    const bed = await anAuthBed();

    await expect(
      bed.logout.execute({ refreshToken: 'token-que-nunca-existiu' }),
    ).resolves.toBeUndefined();
  });
});
