import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { comparisonKey } from '../../../shared/domain/text.js';
import type {
  MemberRepository,
  MemberSummary,
} from '../domain/member.repository.js';
import { isMemberStatus } from '../domain/member-status.js';
import type { MemberAccess } from './member-access.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 100;
const MAX_OFFSET = 100_000;

export interface ListMembersQuery {
  search?: string | null;
  status?: string | null;
  congregationId?: string | null;
  limit?: number;
  offset?: number;
}

export interface MemberListView {
  items: MemberSummary[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * UC-09: lista e busca membros, SÓ das congregações que o usuário pode ver (o escopo vai para a consulta, não para um
 * filtro depois). Pedir uma congregação fora do escopo devolve lista vazia. A lista também é leitura de dado sensível
 * (quem é membro já é convicção religiosa) e é registrada antes de devolver, sem o termo buscado (que pode ser um nome).
 */
export class ListMembersUseCase {
  constructor(
    private readonly repository: MemberRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: MemberAccess,
    query: ListMembersQuery,
  ): Promise<MemberListView> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const offset = query.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      throw new ValidationError(
        'limit',
        `O limite deve estar entre 1 e ${MAX_PAGE_SIZE}.`,
      );
    }
    if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
      throw new ValidationError('offset', 'A posição inicial é inválida.');
    }

    const search = query.search?.trim() ?? '';
    if (search.length > MAX_SEARCH_LENGTH) {
      throw new ValidationError(
        'search',
        `A busca deve ter no máximo ${MAX_SEARCH_LENGTH} caracteres.`,
      );
    }
    if (query.status && !isMemberStatus(query.status)) {
      throw new ValidationError('status', 'A situação informada não existe.');
    }

    // O ESCOPO do usuário é o teto; o filtro por congregação só pode estreitá-lo.
    const readable = access.readableCongregations();
    let congregationIds = readable === null ? null : [...readable];
    if (query.congregationId) {
      const wanted = CongregationId.of(query.congregationId);
      congregationIds =
        readable === null || readable.includes(wanted) ? [wanted] : [];
    }

    const page = await this.repository.search(context.organizationId, {
      congregationIds,
      term: search === '' ? null : comparisonKey(search),
      status:
        query.status && isMemberStatus(query.status) ? query.status : null,
      limit,
      offset,
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'member.listed',
      entity: 'member',
      entityId: null,
      metadata: {
        returned: page.items.length,
        total: page.total,
        searched: search !== '',
        filteredByStatus: Boolean(query.status),
        filteredByCongregation: Boolean(query.congregationId),
      },
    });

    return { items: page.items, total: page.total, limit, offset };
  }
}
