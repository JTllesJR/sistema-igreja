/**
 * Uma permissão como o módulo dono a descreve (ADR 0004 e 0019): a chave ("modulo:acao") e o que ela deixa fazer, em
 * português, para quem monta um papel. Cada módulo exporta a lista das suas; a raiz da aplicação junta todas no catálogo.
 */
export interface PermissionDefinition {
  key: string;
  description: string;
}
