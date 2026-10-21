import { describe, expect, it } from 'vitest';
import { PasswordHash } from '../domain/password-hash.js';
import { PlainPassword } from '../domain/plain-password.js';
import { anEmail } from '../domain/testing/fixtures.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';

const email = anEmail();
const plain = (raw: string) => PlainPassword.create(raw, email);

// Gerado pela biblioteca de referência `argon2` do npm (outra implementação, escrita em C):
// prova que NOSSA verificação aceita hashes de fora e não só os que nós mesmos criamos.
const REFERENCE_PASSWORD = 'uma-senha-de-referencia-123';
const REFERENCE_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$jNXnQlUAzHjR4QXA1w5N3g$t4AnFKHcVqWk1RwDWXai3bbWLxfDHRnRj7N2prWlH9E';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('gera um hash argon2id com os parâmetros padrão do ADR 0010 (19 MiB, 2 passes, 1 faixa)', async () => {
    const hash = await hasher.hash(plain('senha-correta-123'));

    expect(hash.value.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(hash.parameters).toEqual({
      memory: 19456,
      passes: 2,
      parallelism: 1,
    });
  });

  it('dois hashes da mesma senha são diferentes (o sal é aleatório)', async () => {
    const a = await hasher.hash(plain('senha-correta-123'));
    const b = await hasher.hash(plain('senha-correta-123'));

    expect(a.value).not.toBe(b.value);
    expect(a.salt).not.toBe(b.salt);
  });

  it('não contém a senha no hash', async () => {
    const hash = await hasher.hash(plain('senha-correta-123'));

    expect(hash.value).not.toContain('senha-correta-123');
  });

  it('verifica a senha certa e recusa a errada', async () => {
    const hash = await hasher.hash(plain('senha-correta-123'));

    await expect(hasher.verify(plain('senha-correta-123'), hash)).resolves.toBe(
      true,
    );
    await expect(
      hasher.verify(plain('senha-incorreta-123'), hash),
    ).resolves.toBe(false);
  });

  it('é sensível a uma única letra de diferença', async () => {
    const hash = await hasher.hash(plain('senha-correta-123'));

    await expect(hasher.verify(plain('senha-correta-124'), hash)).resolves.toBe(
      false,
    );
    await expect(hasher.verify(plain('Senha-correta-123'), hash)).resolves.toBe(
      false,
    );
  });

  it('aceita um hash gerado por outra implementação (parâmetros em outra ordem)', async () => {
    const hash = PasswordHash.of(REFERENCE_HASH);

    await expect(hasher.verify(plain(REFERENCE_PASSWORD), hash)).resolves.toBe(
      true,
    );
    await expect(
      hasher.verify(plain('outra-senha-qualquer-1'), hash),
    ).resolves.toBe(false);
  });

  describe('endurecimento dos parâmetros (re-hash)', () => {
    const weakHasher = new Argon2PasswordHasher({ memory: 8192, passes: 1 });

    it('um hash atual não precisa de re-hash', async () => {
      const hash = await hasher.hash(plain('senha-correta-123'));

      expect(hasher.needsRehash(hash)).toBe(false);
    });

    it('um hash com parâmetros mais fracos precisa de re-hash, mas ainda é verificado', async () => {
      const old = await weakHasher.hash(plain('senha-correta-123'));

      expect(hasher.needsRehash(old)).toBe(true);
      await expect(
        hasher.verify(plain('senha-correta-123'), old),
      ).resolves.toBe(true);
    });

    it.each([
      ['só a memória é menor', { memory: 8192, passes: 2 }],
      ['só os passes são menores', { memory: 19456, passes: 1 }],
    ])('pede re-hash quando %s', async (_caso, weaker) => {
      const old = await new Argon2PasswordHasher(weaker).hash(
        plain('senha-correta-123'),
      );

      expect(hasher.needsRehash(old)).toBe(true);
    });

    it('um hash mais forte que o padrão não precisa de re-hash', async () => {
      const strong = await new Argon2PasswordHasher({
        memory: 32768,
        passes: 3,
      }).hash(plain('senha-correta-123'));

      expect(hasher.needsRehash(strong)).toBe(false);
    });
  });

  it('simulateVerification conclui sem erro (gasta o tempo de uma verificação)', async () => {
    await expect(
      hasher.simulateVerification(plain('qualquer-senha-123')),
    ).resolves.toBeUndefined();
  });
});
