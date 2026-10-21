import { describe, expect, it } from 'vitest';
import { CongregationId } from '../domain/identifiers.js';
import { UuidV7IdGenerator } from './uuid-v7-id-generator.js';

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UuidV7IdGenerator', () => {
  it('gera UUIDs versão 7 válidos', () => {
    expect(new UuidV7IdGenerator().next()).toMatch(UUID_V7);
  });

  it('não repete identificadores', () => {
    const generator = new UuidV7IdGenerator();

    const ids = new Set(Array.from({ length: 10_000 }, () => generator.next()));

    expect(ids.size).toBe(10_000);
  });

  it('gera em ordem crescente, o que mantém os índices do banco compactos', () => {
    const generator = new UuidV7IdGenerator();

    const ids = Array.from({ length: 1_000 }, () => generator.next());

    expect(ids).toEqual([...ids].sort());
  });

  it('gera ids aceitos pelos identificadores do domínio', () => {
    expect(() =>
      CongregationId.of(new UuidV7IdGenerator().next()),
    ).not.toThrow();
  });
});
