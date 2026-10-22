import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { comparisonKey } from '../../../shared/domain/text.js';
import { ContributorNotFoundError } from '../domain/errors.js';
import type { EntryRepository } from '../domain/finance.repositories.js';
import { type EntryKind, MemberRef } from '../domain/ledger-entry.js';
import type { MemberDirectory } from './directories.js';
import type { FinanceAccess } from './finance-access.js';

export interface MemberContributionsQuery {
  memberId: string;
  /** Início da janela. Ausente = todo o período (Tesoureiro, Dirigente e Diretoria; os 12 meses do próprio membro virão com o portal). */
  since?: string | null;
}

export interface MemberContributionsView {
  member: { id: string; name: string };
  since: string | null;
  /** Líquido: o que entrou menos o que foi estornado. */
  netCents: number;
  byCategory: { categoryId: string | null; netCents: number }[];
  items: {
    id: string;
    congregationId: string;
    occurredOn: string;
    kind: EntryKind;
    direction: 'IN' | 'OUT';
    categoryId: string | null;
    amountCents: number;
  }[];
}

/**
 * Extrato de contribuição de um membro. LEITURA DE DADO SENSÍVEL (ADR 0006 e 0013): registrada na trilha ANTES de
 * devolver, e se o registro falhar nada sai. Só entram lançamentos das congregações em que o usuário tem
 * `finance:read-individual`. O `memberId` é o `entityId` da leitura; a trilha não leva nome nem valores.
 */
export class GetMemberContributionsUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly members: MemberDirectory,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    query: MemberContributionsQuery,
  ): Promise<MemberContributionsView> {
    const memberId = MemberRef.of(query.memberId);
    const since = query.since ? CalendarDate.parse(query.since, 'since') : null;

    const member = await this.members.find(context.organizationId, memberId);
    if (!member) throw new ContributorNotFoundError();

    const scope = access.individualCongregations();
    const list = await this.entries.listByMember(
      context.organizationId,
      memberId,
      { congregationIds: scope, since },
    );
    // Membro de fora do escopo e sem nada visível: para quem consulta, é como se não existisse (não dá para sondar ids).
    if (
      list.length === 0 &&
      scope !== null &&
      !scope.includes(member.congregationId)
    ) {
      throw new ContributorNotFoundError();
    }

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.member_contributions_viewed',
      entity: 'member',
      entityId: memberId,
      metadata: { entries: list.length, windowed: since !== null },
    });

    const byCategory = new Map<string | null, number>();
    let netCents = 0;
    for (const entry of list) {
      byCategory.set(
        entry.categoryId,
        (byCategory.get(entry.categoryId) ?? 0) + entry.signedCents,
      );
      netCents += entry.signedCents;
    }
    return {
      member: { id: member.id, name: member.fullName },
      since: since?.value ?? null,
      netCents,
      byCategory: [...byCategory.entries()].map(([categoryId, cents]) => ({
        categoryId,
        netCents: cents,
      })),
      items: list.map((entry) => ({
        id: entry.id,
        congregationId: entry.congregationId,
        occurredOn: entry.occurredOn.value,
        kind: entry.kind,
        direction: entry.direction,
        categoryId: entry.categoryId,
        amountCents: entry.amount.cents,
      })),
    };
  }
}

const MAX_SEARCH_LENGTH = 100;
const MAX_RESULTS = 20;

/**
 * Busca MÍNIMA de membro para vincular uma contribuição: só id, nome e congregação, nas congregações em que o usuário vê
 * contribuição individual. É assim que o Tesoureiro escolhe o membro sem receber `members:read` (a ficha completa tem
 * endereço e telefone). Lista nomes de pessoas, então é registrada antes de devolver, sem o termo buscado.
 */
export class SearchContributorsUseCase {
  constructor(
    private readonly members: MemberDirectory,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    query: { search: string; limit?: number },
  ): Promise<{ id: string; fullName: string; congregationId: string }[]> {
    const search = query.search.trim();
    if (search.length < 2 || search.length > MAX_SEARCH_LENGTH) {
      throw new ValidationError(
        'search',
        `A busca deve ter entre 2 e ${MAX_SEARCH_LENGTH} caracteres.`,
      );
    }
    const limit = query.limit ?? MAX_RESULTS;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS) {
      throw new ValidationError(
        'limit',
        `O limite deve estar entre 1 e ${MAX_RESULTS}.`,
      );
    }

    const found = await this.members.search(context.organizationId, {
      congregationIds: access.individualCongregations(),
      term: comparisonKey(search),
      limit,
    });

    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.contributors_searched',
      entity: 'member',
      entityId: null,
      metadata: { returned: found.length },
    });
    return found.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      congregationId: m.congregationId,
    }));
  }
}
