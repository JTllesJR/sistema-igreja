/**
 * Permissões do módulo `members` (ADR 0004: cada módulo define as suas). DADOS SENSÍVEIS: cada uma é concedida só onde
 * precisa. O Administrador as tem todas pelo curinga `*`.
 *
 * Ler e escrever são SEPARADAS e uma não implica a outra: um papel de secretaria costuma ter as duas na sua
 * congregação; quem só consulta tem apenas a de leitura.
 */

/** Ver a lista e a ficha dos membros. Vale por congregação (a consulta nunca enxerga o que está fora do escopo). */
export const MEMBERS_READ = 'members:read';

/** Cadastrar, alterar, mudar a situação, transferir e registrar fatos na história. Vale por congregação. */
export const MEMBERS_WRITE = 'members:write';

/** Apagar os dados pessoais de um membro (LGPD). IRREVERSÍVEL: exige a igreja toda. */
export const MEMBERS_ANONYMIZE = 'members:anonymize';
