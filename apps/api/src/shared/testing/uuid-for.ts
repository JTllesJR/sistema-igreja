/** UUIDs determinísticos e legíveis nos testes: o número identifica a entidade. */
export const uuidFor = (n: number): string =>
  `0199c0a4-7b3e-7c11-8f2a-${String(n).padStart(12, '0')}`;
