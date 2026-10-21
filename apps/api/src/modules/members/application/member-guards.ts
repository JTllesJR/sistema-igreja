import type { RequestContext } from '../../../shared/application/request-context.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import {
  CongregationUnavailableError,
  MemberAccessDeniedError,
  MemberNotFoundError,
} from '../domain/errors.js';
import { MemberId } from '../domain/ids.js';
import type { Member } from '../domain/member.js';
import type { MemberRepository } from '../domain/member.repository.js';
import type { CongregationDirectory } from './congregation-directory.js';
import type { MemberAccess } from './member-access.js';

/**
 * Carrega o membro pedido, só se ele for desta igreja E de uma congregação que o usuário pode ver. Do contrário, é
 * "não encontrado": quem não pode ver não descobre nem que o membro existe.
 */
export async function loadVisibleMember(
  repository: MemberRepository,
  context: RequestContext,
  access: MemberAccess,
  rawMemberId: string,
): Promise<Member> {
  const member = await repository.findById(
    context.organizationId,
    MemberId.of(rawMemberId),
  );
  if (!member || !access.canRead(member.congregationId)) {
    throw new MemberNotFoundError();
  }
  return member;
}

/** O usuário já vê o membro; agora precisa poder ESCREVER na congregação dele. */
export function assertCanWrite(access: MemberAccess, member: Member): void {
  if (!access.canWrite(member.congregationId))
    throw new MemberAccessDeniedError();
}

/** A congregação existe nesta igreja e está ativa? Só congregação ativa recebe membros. */
export async function assertActiveCongregation(
  directory: CongregationDirectory,
  context: RequestContext,
  congregationId: CongregationId,
): Promise<void> {
  const status = await directory.statusOf(
    context.organizationId,
    congregationId,
  );
  if (status !== 'ACTIVE') throw new CongregationUnavailableError();
}
