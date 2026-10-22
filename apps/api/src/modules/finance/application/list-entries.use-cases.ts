import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { CalendarDate } from '../../../shared/domain/calendar-date.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { ApprovalNotAllowedError } from '../domain/errors.js';
import type { EntryStatus } from '../domain/ledger-entry.js';
import type {
  AccountRepository,
  EntryRepository,
} from '../domain/finance.repositories.js';
import { AccountId, CategoryId } from '../domain/ids.js';
import type { CongregationDirectory, MemberDirectory } from './directories.js';
import type { FinanceAccess } from './finance-access.js';
import { presentEntries } from './present-entries.js';
import type { AccountView, EntryListView } from './views.js';
import { toAccountView } from './views.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 100_000;

const STATUSES: readonly EntryStatus[] = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'CANCELLED',
];

export interface ListEntriesQuery {
  congregationId?: string | null;
  accountId?: string | null;
  categoryId?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

function pagination(query: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
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
  return { limit, offset };
}

/**
 * Lista os lançamentos das congregações que o usuário vê (o escopo vai para a consulta, não para um filtro depois).
 * Pedir uma congregação fora do escopo devolve lista vazia. Quem contribuiu só aparece a quem tem
 * `finance:read-individual` (e então a leitura é auditada antes de devolver).
 */
export class ListEntriesUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly members: MemberDirectory,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    query: ListEntriesQuery,
  ): Promise<EntryListView> {
    const { limit, offset } = pagination(query);
    if (query.status && !STATUSES.includes(query.status as EntryStatus)) {
      throw new ValidationError('status', 'A situação informada não existe.');
    }
    const from = query.from ? CalendarDate.parse(query.from, 'from') : null;
    const to = query.to ? CalendarDate.parse(query.to, 'to') : null;
    if (from && to && from.isAfter(to)) {
      throw new ValidationError('from', 'O início vem depois do fim.');
    }

    // O ESCOPO do usuário é o teto; o filtro por congregação só pode estreitá-lo.
    const readable = access.readableCongregations();
    let congregationIds = readable === null ? null : [...readable];
    if (query.congregationId) {
      const wanted = CongregationId.of(query.congregationId);
      congregationIds =
        readable === null || readable.includes(wanted) ? [wanted] : [];
    }

    const page = await this.entries.search(context.organizationId, {
      congregationIds,
      accountId: query.accountId ? AccountId.of(query.accountId) : null,
      status: (query.status as EntryStatus | null | undefined) ?? null,
      categoryId: query.categoryId ? CategoryId.of(query.categoryId) : null,
      from,
      to,
      limit,
      offset,
    });
    const items = await presentEntries(
      page.items,
      context,
      access,
      this.members,
      this.audit,
    );
    return { items, total: page.total, limit, offset };
  }
}

/**
 * A fila da sede: pedidos pendentes de TODAS as congregações, do mais recente para o mais antigo. Só quem alcança a sede
 * a vê, e então vê os pedidos da igreja toda (é a natureza de aprovar). Quem contribuiu continua escondido de quem não
 * tem `finance:read-individual`.
 */
export class ListApprovalsUseCase {
  constructor(
    private readonly entries: EntryRepository,
    private readonly congregations: CongregationDirectory,
    private readonly members: MemberDirectory,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    query: { limit?: number; offset?: number },
  ): Promise<EntryListView> {
    const { limit, offset } = pagination(query);
    const headquarters = await this.congregations.headquartersOf(
      context.organizationId,
    );
    if (headquarters === null || !access.canApprove(headquarters)) {
      throw new ApprovalNotAllowedError();
    }

    const page = await this.entries.search(context.organizationId, {
      congregationIds: null,
      accountId: null,
      status: 'PENDING',
      categoryId: null,
      from: null,
      to: null,
      limit,
      offset,
    });
    const items = await presentEntries(
      page.items,
      context,
      access,
      this.members,
      this.audit,
    );
    return { items, total: page.total, limit, offset };
  }
}

/**
 * Para onde se pode repassar: se a conta de origem é da sede, as contas ativas das outras congregações; senão, as contas
 * ativas da sede. Mostra só nome e tipo (sem saldo): quem repassa não precisa ler o financeiro do destino.
 */
export class ListTransferDestinationsUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly congregations: CongregationDirectory,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    query: { fromAccountId: string },
  ): Promise<Omit<AccountView, 'balanceCents'>[]> {
    const from = await this.accounts.findById(
      context.organizationId,
      AccountId.of(query.fromAccountId),
    );
    if (!from || !access.canWrite(from.congregationId)) return [];

    const headquarters = await this.congregations.headquartersOf(
      context.organizationId,
    );
    if (headquarters === null) return [];

    const all = await this.accounts.list(context.organizationId, {
      congregationIds: null,
      includeArchived: false,
    });
    const destinations = all.filter((account) =>
      from.congregationId === headquarters
        ? account.congregationId !== headquarters
        : account.congregationId === headquarters,
    );
    return destinations.map((account) => {
      const { balanceCents: _balance, ...view } = toAccountView(account, 0);
      return view;
    });
  }
}
