/**
 * Cargo do membro na igreja. DADO SENSÍVEL (convicção religiosa, ADR 0006). É diferente da SITUAÇÃO (`MemberStatus`:
 * ativo, afastado...): o cargo diz o que a pessoa é na liderança, a situação diz se ela está presente.
 *
 * A lista é a que a igreja informou (2026-10-22, `docs/casos-de-uso-mvp.md`). Trocar a lista exige uma migration do enum
 * no banco. O feminino de Diácono é um valor próprio porque a igreja os trata como cargos distintos.
 *
 * - `MEMBER`: membro, sem cargo (o padrão).
 * - `AUXILIARY`: auxiliar.
 * - `DEACON` / `DEACONESS`: diácono / diaconisa.
 * - `PRESBYTER`: presbítero.
 * - `EVANGELIST`: evangelista.
 * - `PASTOR`: pastor.
 */
export const MEMBER_POSITIONS = [
  'MEMBER',
  'AUXILIARY',
  'DEACON',
  'DEACONESS',
  'PRESBYTER',
  'EVANGELIST',
  'PASTOR',
] as const;

export type MemberPosition = (typeof MEMBER_POSITIONS)[number];

export const isMemberPosition = (value: string): value is MemberPosition =>
  (MEMBER_POSITIONS as readonly string[]).includes(value);
