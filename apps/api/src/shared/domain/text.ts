/** Remove espaços nas pontas e reduz qualquer sequência de espaços/tabs/quebras a um único espaço. */
export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Chave para comparar textos "ignorando detalhes": caixa, acentos e espaços sobrando.
 * "  São   PAULO " e "sao paulo" geram a mesma chave. Use só para comparar, nunca para exibir.
 *
 * `normalize('NFD')` separa a letra do acento ("ã" vira "a" + "~"); `\p{M}` remove as marcas combinantes.
 */
export function comparisonKey(value: string): string {
  return collapseWhitespace(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Texto opcional: aparado e, se ficar vazio, vira `null` (ausente). */
export function optionalText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const collapsed = collapseWhitespace(value);
  return collapsed === '' ? null : collapsed;
}
