/**
 * Permissões do módulo `audit` (ADR 0004: cada módulo define as suas). O Administrador a tem pelo curinga `*`.
 */

/**
 * Consultar a trilha de auditoria. Exige a IGREJA TODA: a trilha mostra quem leu o quê em todas as congregações, então
 * não faz sentido por congregação. Dado sensível por natureza (quem consultou quem): a própria consulta é registrada.
 */
export const AUDIT_READ = 'audit:read';
