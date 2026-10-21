import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { PasswordHash } from './password-hash.js';
import { A_PASSWORD_HASH } from './testing/fixtures.js';

describe('PasswordHash', () => {
  it('aceita um hash argon2id no formato PHC e o devolve inalterado', () => {
    expect(PasswordHash.of(A_PASSWORD_HASH).value).toBe(A_PASSWORD_HASH);
  });

  it('expõe os parâmetros usados (para decidir um re-hash)', () => {
    expect(PasswordHash.of(A_PASSWORD_HASH).parameters).toEqual({
      memory: 19456,
      passes: 2,
      parallelism: 1,
    });
  });

  it.each([
    '',
    'senha123',
    '$2b$10$abcdefghijklmnopqrstuuabcdefghijklmnopqrstuvwxyz01234', // bcrypt
    '$argon2i$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA', // variante errada
    '$argon2id$v=19$m=19456,t=2$c29tZXNhbHQ$aGFzaA', // sem paralelismo
    '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ', // sem o hash
  ])('rejeita "%s"', (raw) => {
    const error = thrownBy(() => PasswordHash.of(raw));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'passwordHash' });
  });

  it('compara por valor', () => {
    expect(
      PasswordHash.of(A_PASSWORD_HASH).equals(PasswordHash.of(A_PASSWORD_HASH)),
    ).toBe(true);
  });
});
