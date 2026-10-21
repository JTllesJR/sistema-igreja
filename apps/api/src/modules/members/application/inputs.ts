/**
 * Entrada opcional que chega como texto: `undefined` = não informado (manter o que está), `null` ou texto em branco =
 * apagar, texto = valor novo (convertido e validado por `parse`). Um campo em branco de formulário vira "apagar".
 */
export function optionalInput<T>(
  raw: string | null | undefined,
  parse: (value: string) => T,
): T | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw.trim() === '') return null;
  return parse(raw);
}
