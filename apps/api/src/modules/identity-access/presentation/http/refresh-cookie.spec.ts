import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { bearerTokenOf } from './auth.guard.js';
import { readRefreshToken } from './refresh-cookie.js';

const requestWith = (cookie?: string) =>
  ({ headers: cookie === undefined ? {} : { cookie } }) as Request;

describe('readRefreshToken', () => {
  it.each([
    ['refresh_token=abc', 'abc'],
    ['a=1; refresh_token=abc; b=2', 'abc'],
    ['  refresh_token=abc  ', 'abc'],
    ['refresh_token=abc=def', 'abc=def'],
  ])('lê o valor em %j', (header, expected) => {
    expect(readRefreshToken(requestWith(header))).toBe(expected);
  });

  it.each([
    ['sem cabeçalho', undefined],
    ['cookie com outro nome', 'outro=abc'],
    ['nome parecido', 'xrefresh_token=abc; refresh_token_2=abc'],
    ['valor vazio', 'refresh_token='],
    ['sem sinal de igual', 'refresh_token'],
    ['valor gigante', `refresh_token=${'a'.repeat(513)}`],
  ])('devolve null: %s', (_nome, header) => {
    expect(readRefreshToken(requestWith(header))).toBeNull();
  });
});

describe('bearerTokenOf', () => {
  it.each([
    ['Bearer abc.def.ghi', 'abc.def.ghi'],
    ['bearer abc', 'abc'],
    ['BEARER abc', 'abc'],
  ])('lê o token em %j', (header, expected) => {
    expect(bearerTokenOf(header)).toBe(expected);
  });

  it.each([
    undefined,
    '',
    'Bearer',
    'Bearer ',
    'Bearer  abc',
    'Bearer a b',
    'Basic abc',
    'abc',
    'Bearerabc',
  ])('devolve null para %j', (header) => {
    expect(bearerTokenOf(header)).toBeNull();
  });
});
