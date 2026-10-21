import { decodeProtectedHeader, errors, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { SessionId, UserId } from '../domain/ids.js';
import { NOW } from '../domain/testing/fixtures.js';
import { JoseAccessTokenSigner } from './jose-access-token-signer.js';

const SECRET = 'um-segredo-de-teste-com-mais-de-32-caracteres';
const key = (secret: string) => new TextEncoder().encode(secret);

const claims = {
  userId: UserId.of(uuidFor(1)),
  organizationId: OrganizationId.of(uuidFor(2)),
  sessionId: SessionId.of(uuidFor(3)),
};

const signer = new JoseAccessTokenSigner({ secret: SECRET, ttlSeconds: 900 });

describe('JoseAccessTokenSigner', () => {
  it('assina um JWT HS256 que a mesma chave verifica, com sub, org e sid', async () => {
    const { token } = await signer.sign(claims, NOW);

    const { payload, protectedHeader } = await jwtVerify(token, key(SECRET), {
      algorithms: ['HS256'],
      currentDate: NOW,
    });

    expect(protectedHeader.alg).toBe('HS256');
    expect(payload.sub).toBe(claims.userId);
    expect(payload['org']).toBe(claims.organizationId);
    expect(payload['sid']).toBe(claims.sessionId);
  });

  it('expira no prazo configurado e informa o instante de expiração', async () => {
    const { token, expiresAt } = await signer.sign(claims, NOW);

    const { payload } = await jwtVerify(token, key(SECRET), {
      currentDate: NOW,
    });

    expect(payload.iat).toBe(Math.floor(NOW.getTime() / 1000));
    expect(payload.exp).toBe(Math.floor(NOW.getTime() / 1000) + 900);
    expect(expiresAt).toEqual(new Date(NOW.getTime() + 900_000));
  });

  it('respeita um prazo diferente do padrão', async () => {
    const short = new JoseAccessTokenSigner({ secret: SECRET, ttlSeconds: 60 });

    const { expiresAt } = await short.sign(claims, NOW);

    expect(expiresAt).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('não carrega permissões nem dados pessoais: apenas sub, org, sid, iat e exp', async () => {
    const { token } = await signer.sign(claims, NOW);

    const { payload } = await jwtVerify(token, key(SECRET), {
      currentDate: NOW,
    });

    expect(Object.keys(payload).sort()).toEqual([
      'exp',
      'iat',
      'org',
      'sid',
      'sub',
    ]);
  });

  it('não é aceito com outro segredo', async () => {
    const { token } = await signer.sign(claims, NOW);

    await expect(
      jwtVerify(token, key('outro-segredo-completamente-diferente-123'), {
        currentDate: NOW,
      }),
    ).rejects.toBeInstanceOf(errors.JWSSignatureVerificationFailed);
  });

  it('deixa de ser aceito depois de expirar', async () => {
    const { token } = await signer.sign(claims, NOW);

    await expect(
      jwtVerify(token, key(SECRET), {
        currentDate: new Date(NOW.getTime() + 901_000),
      }),
    ).rejects.toBeInstanceOf(errors.JWTExpired);
  });

  it('declara HS256 no cabeçalho (nunca "none")', async () => {
    const { token } = await signer.sign(claims, NOW);

    expect(decodeProtectedHeader(token).alg).toBe('HS256');
  });

  it('recusa um segredo com menos de 32 caracteres', () => {
    expect(
      () => new JoseAccessTokenSigner({ secret: 'curto', ttlSeconds: 900 }),
    ).toThrow(/32/);
  });
});
