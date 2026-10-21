import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
} from './auth.js';

describe('loginRequestSchema', () => {
  it('aceita e-mail e senha', () => {
    expect(
      loginRequestSchema.safeParse({ email: 'a@b.com', password: 'x' }).success,
    ).toBe(true);
  });

  it.each([
    ['sem senha', { email: 'a@b.com' }],
    ['senha vazia', { email: 'a@b.com', password: '' }],
    ['e-mail vazio', { email: '', password: 'x' }],
    ['tipos errados', { email: 1, password: ['x'] }],
    ['senha gigante', { email: 'a@b.com', password: 'x'.repeat(257) }],
  ])('recusa %s', (_nome, corpo) => {
    expect(loginRequestSchema.safeParse(corpo).success).toBe(false);
  });

  it('descarta campos desconhecidos em vez de repassá-los', () => {
    const resultado = loginRequestSchema.parse({
      email: 'a@b.com',
      password: 'x',
      organizationId: 'outra-igreja',
    });
    expect(resultado).toEqual({ email: 'a@b.com', password: 'x' });
  });
});

describe('changePasswordRequestSchema', () => {
  it('exige a senha atual e a nova', () => {
    expect(
      changePasswordRequestSchema.safeParse({ currentPassword: 'a' }).success,
    ).toBe(false);
    expect(
      changePasswordRequestSchema.safeParse({
        currentPassword: 'a',
        newPassword: 'b',
      }).success,
    ).toBe(true);
  });
});

describe('loginResponseSchema', () => {
  it('exige data de expiração em ISO 8601', () => {
    const base = {
      accessToken: 't',
      user: { id: '1', organizationId: '2', email: 'a@b.com', roles: [] },
    };
    expect(
      loginResponseSchema.safeParse({
        ...base,
        accessTokenExpiresAt: '2026-10-21T12:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      loginResponseSchema.safeParse({
        ...base,
        accessTokenExpiresAt: 'amanhã',
      }).success,
    ).toBe(false);
  });
});
