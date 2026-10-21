const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Formato de UUID (RFC 9562, versões 1 a 8). Não verifica se o id existe. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
