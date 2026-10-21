import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it.each(['/conta', '/congregacoes/1?aba=2', '/'])(
    'aceita o caminho interno %s',
    (path) => {
      expect(safeRedirect(path)).toBe(path);
    },
  );

  it.each([
    ['//evil.com'],
    ['https://evil.com'],
    ['http://evil.com/conta'],
    ['javascript:alert(1)'],
    ['/\\evil.com'],
    ['/conta\nSet-Cookie: x=1'],
    ['conta'],
    [''],
  ])('recusa %j e usa o padrão', (value) => {
    expect(safeRedirect(value)).toBe('/conta');
  });

  it('recusa o que não é texto', () => {
    expect(safeRedirect(undefined)).toBe('/conta');
    expect(safeRedirect({ from: '/x' })).toBe('/conta');
  });

  it('usa o padrão informado', () => {
    expect(safeRedirect(null, '/')).toBe('/');
  });
});
