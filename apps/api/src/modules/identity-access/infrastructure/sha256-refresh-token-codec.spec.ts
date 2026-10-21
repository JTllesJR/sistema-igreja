import { describe, expect, it } from 'vitest';
import { Sha256RefreshTokenCodec } from './sha256-refresh-token-codec.js';

const codec = new Sha256RefreshTokenCodec();

describe('Sha256RefreshTokenCodec', () => {
  it('gera tokens aleatórios de 256 bits em base64url (43 caracteres)', () => {
    expect(codec.generate().token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('não repete tokens', () => {
    const tokens = new Set(
      Array.from({ length: 1_000 }, () => codec.generate().token),
    );

    expect(tokens.size).toBe(1_000);
  });

  it('o hash é um SHA-256 em hexadecimal (64 caracteres) e não contém o token', () => {
    const { token, hash } = codec.generate();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it('hashOf é determinístico e coincide com o hash devolvido por generate', () => {
    const { token, hash } = codec.generate();

    expect(codec.hashOf(token)).toBe(hash);
    expect(codec.hashOf(token)).toBe(codec.hashOf(token));
  });

  it('tokens diferentes têm hashes diferentes', () => {
    expect(codec.hashOf('token-a')).not.toBe(codec.hashOf('token-b'));
  });

  it('calcula o SHA-256 padrão (vetor de teste conhecido para "abc")', () => {
    expect(codec.hashOf('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
