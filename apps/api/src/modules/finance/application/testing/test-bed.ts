import type { RequestContext } from '../../../../shared/application/request-context.js';
import type {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { FixedClock } from '../../../../shared/testing/fixed-clock.js';
import { InMemoryAuditLog } from '../../../../shared/testing/in-memory-audit-log.js';
import { SequentialIdGenerator } from '../../../../shared/testing/sequential-id-generator.js';
import type { LedgerEntry, MemberRef } from '../../domain/ledger-entry.js';
import {
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  InMemoryEntryRepository,
} from '../../domain/testing/in-memory-finance.repositories.js';
import {
  NOW,
  aCategory,
  aConfiguration,
  actor,
  anAccount,
  congId,
  member,
  orgId,
} from '../../domain/testing/fixtures.js';
import {
  CreateAccountUseCase,
  ListAccountsUseCase,
  UpdateAccountUseCase,
} from '../account.use-cases.js';
import {
  CreateCategoryUseCase,
  EnsureDefaultCategoriesUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
} from '../category.use-cases.js';
import {
  GetMemberContributionsUseCase,
  SearchContributorsUseCase,
} from '../contributions.use-cases.js';
import { GetDashboardUseCase } from '../dashboard.use-case.js';
import {
  ApproveEntryUseCase,
  CancelEntryUseCase,
  RejectEntryUseCase,
} from '../decide-entries.use-cases.js';
import type {
  CongregationDirectory,
  MemberDirectory,
  MemberInfo,
} from '../directories.js';
import type { FinanceAccess } from '../finance-access.js';
import {
  ListApprovalsUseCase,
  ListEntriesUseCase,
  ListTransferDestinationsUseCase,
} from '../list-entries.use-cases.js';
import {
  RecordIncomeUseCase,
  RequestExpenseUseCase,
  RequestOpeningBalanceUseCase,
  RequestReversalUseCase,
  RequestTransferUseCase,
} from '../record-entries.use-cases.js';

type Scope = 'ALL' | readonly CongregationId[];

const includes = (scope: Scope, id: CongregationId): boolean =>
  scope === 'ALL' || scope.includes(id);

/** O acesso de um usuário de teste: onde lê, lança, vê quem contribuiu e aprova. */
export class FakeFinanceAccess implements FinanceAccess {
  constructor(
    private readonly scopes: {
      read: Scope;
      write?: Scope;
      individual?: Scope;
      approve?: Scope;
      categories?: boolean;
    },
  ) {}

  readableCongregations(): readonly CongregationId[] | null {
    return this.scopes.read === 'ALL' ? null : this.scopes.read;
  }
  canRead(congregationId: CongregationId): boolean {
    return includes(this.scopes.read, congregationId);
  }
  canWrite(congregationId: CongregationId): boolean {
    return includes(this.scopes.write ?? [], congregationId);
  }
  individualCongregations(): readonly CongregationId[] | null {
    const scope = this.scopes.individual ?? [];
    return scope === 'ALL' ? null : scope;
  }
  canReadIndividual(congregationId: CongregationId): boolean {
    return includes(this.scopes.individual ?? [], congregationId);
  }
  canApprove(headquarters: CongregationId): boolean {
    return includes(this.scopes.approve ?? [], headquarters);
  }
  canManageCategories(): boolean {
    return this.scopes.categories ?? false;
  }
}

/** Quem pode tudo, na igreja toda (como o Administrador). */
export const everything = (): FakeFinanceAccess =>
  new FakeFinanceAccess({
    read: 'ALL',
    write: 'ALL',
    individual: 'ALL',
    approve: 'ALL',
    categories: true,
  });

/** Tesoureiro de uma congregação: lê, lança e vê quem contribuiu só ali. Não aprova. */
export const treasurerOf = (...congregations: number[]): FakeFinanceAccess => {
  const scope = congregations.map(congId);
  return new FakeFinanceAccess({
    read: scope,
    write: scope,
    individual: scope,
  });
};

/** Diretoria: vê tudo e aprova (alcança a sede), mas não lança. */
export const board = (): FakeFinanceAccess =>
  new FakeFinanceAccess({ read: 'ALL', individual: 'ALL', approve: 'ALL' });

/** Diretório de congregações de teste: cada igreja conhece as suas e tem uma sede. */
export class FakeCongregationDirectory implements CongregationDirectory {
  readonly #status = new Map<string, 'ACTIVE' | 'INACTIVE'>();
  readonly #headquarters = new Map<string, CongregationId>();

  set(
    organizationId: OrganizationId,
    congregationId: CongregationId,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
    headquarters = false,
  ): void {
    this.#status.set(`${organizationId}:${congregationId}`, status);
    if (headquarters) this.#headquarters.set(organizationId, congregationId);
  }

  statusOf(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<'ACTIVE' | 'INACTIVE' | null> {
    return Promise.resolve(
      this.#status.get(`${organizationId}:${congregationId}`) ?? null,
    );
  }

  headquartersOf(
    organizationId: OrganizationId,
  ): Promise<CongregationId | null> {
    return Promise.resolve(this.#headquarters.get(organizationId) ?? null);
  }
}

/** Membros de teste: só id, nome e congregação (o que o financeiro enxerga). */
export class FakeMemberDirectory implements MemberDirectory {
  readonly #members = new Map<
    string,
    MemberInfo & { organizationId: string }
  >();

  add(
    organizationId: OrganizationId,
    id: MemberRef,
    fullName: string,
    congregationId: CongregationId,
  ): void {
    this.#members.set(id, { id, fullName, congregationId, organizationId });
  }

  find(
    organizationId: OrganizationId,
    id: MemberRef,
  ): Promise<MemberInfo | null> {
    const found = this.#members.get(id);
    return Promise.resolve(
      found && found.organizationId === organizationId ? found : null,
    );
  }

  async findMany(
    organizationId: OrganizationId,
    ids: readonly MemberRef[],
  ): Promise<MemberInfo[]> {
    const found = await Promise.all(
      ids.map((id) => this.find(organizationId, id)),
    );
    return found.filter((m): m is MemberInfo => m !== null);
  }

  search(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      term: string | null;
      limit: number;
    },
  ): Promise<MemberInfo[]> {
    const allowed = criteria.congregationIds;
    return Promise.resolve(
      [...this.#members.values()]
        .filter(
          (m) =>
            m.organizationId === organizationId &&
            (allowed === null || allowed.includes(m.congregationId)) &&
            (criteria.term === null ||
              m.fullName.toLowerCase().includes(criteria.term)),
        )
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .slice(0, criteria.limit),
    );
  }
}

/**
 * Monta todos os casos de uso do finance sobre repositórios em memória, com o cenário das fixtures: a igreja 1 tem a
 * sede (congregação 1) e as congregações 2 e 3; a igreja 2 tem a 10. Membros 1 (cong. 1), 2 (cong. 2) e 3 (cong. 1).
 * O contexto padrão é a pessoa 1 da igreja 1; `as(n)` troca quem está pedindo.
 */
export async function aTestBed() {
  const accounts = new InMemoryAccountRepository();
  const categories = new InMemoryCategoryRepository();
  const entries = new InMemoryEntryRepository();
  const congregations = new FakeCongregationDirectory();
  const members = new FakeMemberDirectory();
  const audit = new InMemoryAuditLog();
  const clock = new FixedClock(NOW);
  // Começa longe dos ids das fixtures (2000 a 7000) para nunca colidir com eles.
  const ids = new SequentialIdGenerator(900_000);

  for (const spec of aConfiguration.accounts) {
    await accounts.add(anAccount(spec.n));
    congregations.set(
      orgId(spec.organization),
      congId(spec.congregation),
      'ACTIVE',
      spec.congregation === 1 || spec.congregation === 10,
    );
  }
  congregations.set(orgId(1), congId(2));
  congregations.set(orgId(1), congId(3));
  for (const spec of aConfiguration.categories) {
    await categories.add(aCategory(spec.n));
  }
  members.add(orgId(1), member(1), 'Maria da Silva', congId(1));
  members.add(orgId(1), member(2), 'João Pereira', congId(2));
  members.add(orgId(1), member(3), 'Ana Souza', congId(1));

  const context: RequestContext = {
    organizationId: orgId(1),
    actorId: actor(1),
  };
  const as = (n: number, organization = 1): RequestContext => ({
    organizationId: orgId(organization),
    actorId: actor(n),
  });

  const find = async (id: string): Promise<LedgerEntry | null> =>
    entries.findById(orgId(1), id as never);

  return {
    accounts,
    categories,
    entries,
    congregations,
    members,
    audit,
    clock,
    ids,
    context,
    as,
    find,
    createAccount: new CreateAccountUseCase(
      accounts,
      congregations,
      ids,
      audit,
    ),
    updateAccount: new UpdateAccountUseCase(accounts, audit),
    listAccounts: new ListAccountsUseCase(accounts, entries),
    createCategory: new CreateCategoryUseCase(categories, ids, audit),
    updateCategory: new UpdateCategoryUseCase(categories, audit),
    listCategories: new ListCategoriesUseCase(categories),
    ensureDefaultCategories: new EnsureDefaultCategoriesUseCase(
      categories,
      ids,
      audit,
    ),
    recordIncome: new RecordIncomeUseCase(
      accounts,
      categories,
      entries,
      congregations,
      members,
      ids,
      clock,
      audit,
    ),
    requestExpense: new RequestExpenseUseCase(
      accounts,
      categories,
      entries,
      congregations,
      ids,
      clock,
      audit,
    ),
    requestOpeningBalance: new RequestOpeningBalanceUseCase(
      accounts,
      entries,
      congregations,
      ids,
      clock,
      audit,
    ),
    requestTransfer: new RequestTransferUseCase(
      accounts,
      entries,
      congregations,
      ids,
      clock,
      audit,
    ),
    requestReversal: new RequestReversalUseCase(entries, ids, clock, audit),
    approve: new ApproveEntryUseCase(entries, congregations, clock, audit),
    reject: new RejectEntryUseCase(entries, congregations, clock, audit),
    cancel: new CancelEntryUseCase(entries, clock, audit),
    listEntries: new ListEntriesUseCase(entries, members, audit),
    listApprovals: new ListApprovalsUseCase(
      entries,
      congregations,
      members,
      audit,
    ),
    listDestinations: new ListTransferDestinationsUseCase(
      accounts,
      congregations,
    ),
    dashboard: new GetDashboardUseCase(entries, clock),
    contributions: new GetMemberContributionsUseCase(entries, members, audit),
    searchContributors: new SearchContributorsUseCase(members, audit),
  };
}

export type TestBed = Awaited<ReturnType<typeof aTestBed>>;
