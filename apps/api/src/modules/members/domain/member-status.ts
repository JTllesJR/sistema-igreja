/**
 * Situação do membro na igreja. DADO SENSÍVEL (convicção religiosa, ADR 0006).
 *
 * Os valores são PROVISÓRIOS: a lista real é a pergunta 1 a validar com a igreja (docs/casos-de-uso-mvp.md). Trocar
 * a lista exige uma migration do enum no banco, por isso começamos com o mínimo.
 *
 * - `ACTIVE`: frequenta e está em plena comunhão.
 * - `AWAY`: afastado (deixou de frequentar), mas ainda consta no rol.
 * - `TRANSFERRED_OUT`: saiu para uma igreja de FORA do sistema (a mudança entre congregações é uma transferência).
 * - `DECEASED`: falecido.
 */
export const MEMBER_STATUSES = [
  'ACTIVE',
  'AWAY',
  'TRANSFERRED_OUT',
  'DECEASED',
] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const isMemberStatus = (value: string): value is MemberStatus =>
  (MEMBER_STATUSES as readonly string[]).includes(value);
