import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import { SessionId, UserId } from '../domain/ids.js';
import { NOW } from '../domain/testing/fixtures.js';
import { JoseAccessTokenSigner } from './jose-access-token-signer.js';

const SECRET = 'um-segredo-de-teste-com-mais-de-32-caracteres';
const OTHER_SECRET = 'outro-segredo-de-teste-com-mais-de-32-caracteres';
const key = (secret: string) => new TextEncoder().encode(secret);
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

const claims = {
  userId: UserId.of(uuidFor(1)),
  organizationId: OrganizationId.of(uuidFor(2)),
  sessionId: SessionId.of(uuidFor(3)),
};

const signer = new JoseAccessTokenSigner({ secret: SECRET, ttlSeconds: 900 });
const after = (ms: number) => new Date(NOW.getTime() + ms);

/** Um JWT válido em tudo, exceto pelo que o teste quer estragar. */
function jwt(
  payload: Record<string, unknown>,
  options: { secret?: string; alg?: string; exp?: number } = {},
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: options.alg ?? 'HS256' })
    .setIssuedAt(seconds(NOW))
    .setExpirationTime(options.exp ?? seconds(NOW) + 900)
    .sign(key(options.secret ?? SECRET));
}

const good = {
  sub: uuidFor(1),
  org: uuidFor(2),
  sid: uuidFor(3),
};

describe('JoseAccessTokenSigner.verify', () => {
  it('devolve as afirmações de um token que ele mesmo emitiu', async () => {
    const { token } = await signer.sign(claims, NOW);

    expect(await signer.verify(token, NOW)).toEqual(claims);
  });

  it('vale até o instante de expiração e não depois', async () => {
    const { token } = await signer.sign(claims, NOW);

    expect(await signer.verify(token, after(899_000))).toEqual(claims);
    expect(await signer.verify(token, after(901_000))).toBeNull();
  });

  it('recusa token assinado com outro segredo', async () => {
    const token = await jwt(good, { secret: OTHER_SECRET });

    expect(await signer.verify(token, NOW)).toBeNull();
  });

  it('recusa token com o conteúdo adulterado', async () => {
    const { token } = await signer.sign(claims, NOW);
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...good, sub: uuidFor(9), exp: seconds(NOW) + 900 }),
    ).toString('base64url');

    expect(
      await signer.verify(`${header}.${forgedPayload}.${signature}`, NOW),
    ).toBeNull();
  });

  it('recusa o algoritmo "none" (token sem assinatura)', async () => {
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none' })}.${encode({ ...good, iat: seconds(NOW), exp: seconds(NOW) + 900 })}.`;

    expect(await signer.verify(unsigned, NOW)).toBeNull();
  });

  it('recusa outro algoritmo mesmo com a chave certa (HS512)', async () => {
    const token = await jwt(good, { alg: 'HS512' });

    expect(await signer.verify(token, NOW)).toBeNull();
  });

  it.each([
    ['sem sub', { org: good.org, sid: good.sid }],
    ['sem org', { sub: good.sub, sid: good.sid }],
    ['sem sid', { sub: good.sub, org: good.org }],
    ['sub que não é identificador', { ...good, sub: 'admin' }],
    ['org com tipo errado', { ...good, org: 42 }],
  ])('recusa token assinado corretamente, mas %s', async (_nome, payload) => {
    expect(await signer.verify(await jwt(payload), NOW)).toBeNull();
  });

  it('recusa token sem prazo de expiração', async () => {
    const token = await new SignJWT(good)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(seconds(NOW))
      .sign(key(SECRET));

    expect(await signer.verify(token, NOW)).toBeNull();
  });

  it.each(['', 'abc', 'a.b.c', 'Bearer x'])(
    'recusa lixo (%j) sem lançar exceção',
    async (garbage) => {
      expect(await signer.verify(garbage, NOW)).toBeNull();
    },
  );
});
