import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
// Só a API pública do módulo `members` (ADR 0001): nunca suas tabelas nem suas entidades.
import type { MemberQueries } from '../../members/index.js';
import type {
  MemberDirectory,
  MemberInfo,
} from '../application/directories.js';
import { MemberRef } from '../domain/ledger-entry.js';

/** Adaptador (anti-corrupção): traduz a porta que o `finance` precisa para a API pública mínima do `members`. */
export class MemberQueriesDirectory implements MemberDirectory {
  constructor(private readonly queries: MemberQueries) {}

  async find(
    organizationId: OrganizationId,
    id: MemberRef,
  ): Promise<MemberInfo | null> {
    const found = await this.queries.find(organizationId, id);
    return found ? toInfo(found) : null;
  }

  async findMany(
    organizationId: OrganizationId,
    ids: readonly MemberRef[],
  ): Promise<MemberInfo[]> {
    return (await this.queries.findMany(organizationId, ids)).map(toInfo);
  }

  async search(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      term: string | null;
      limit: number;
    },
  ): Promise<MemberInfo[]> {
    return (await this.queries.search(organizationId, criteria)).map(toInfo);
  }
}

function toInfo(brief: {
  id: string;
  fullName: string;
  congregationId: CongregationId;
}): MemberInfo {
  return {
    id: MemberRef.of(brief.id),
    fullName: brief.fullName,
    congregationId: brief.congregationId,
  };
}
