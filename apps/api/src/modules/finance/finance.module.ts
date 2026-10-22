import { Module, type Provider } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import type { AuditLog } from '../../shared/application/audit-log.js';
import type { Clock } from '../../shared/application/clock.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '../../shared/infrastructure/uuid-v7-id-generator.js';
import { AUDIT_LOG, AuditModule } from '../audit/index.js';
import { MEMBER_QUERIES, MembersModule } from '../members/index.js';
import type { MemberQueries } from '../members/index.js';
import {
  ORGANIZATION_QUERIES,
  OrganizationModule,
} from '../organization/index.js';
import type { OrganizationQueries } from '../organization/index.js';
import {
  CreateAccountUseCase,
  ListAccountsUseCase,
  UpdateAccountUseCase,
} from './application/account.use-cases.js';
import {
  CreateCategoryUseCase,
  EnsureDefaultCategoriesUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
} from './application/category.use-cases.js';
import {
  GetMemberContributionsUseCase,
  SearchContributorsUseCase,
} from './application/contributions.use-cases.js';
import { GetDashboardUseCase } from './application/dashboard.use-case.js';
import {
  ApproveEntryUseCase,
  CancelEntryUseCase,
  RejectEntryUseCase,
} from './application/decide-entries.use-cases.js';
import type {
  CongregationDirectory,
  MemberDirectory,
} from './application/directories.js';
import {
  ListApprovalsUseCase,
  ListEntriesUseCase,
  ListTransferDestinationsUseCase,
} from './application/list-entries.use-cases.js';
import {
  RecordIncomeUseCase,
  RequestExpenseUseCase,
  RequestOpeningBalanceUseCase,
  RequestReversalUseCase,
  RequestTransferUseCase,
} from './application/record-entries.use-cases.js';
import type {
  AccountRepository,
  CategoryRepository,
  EntryRepository,
} from './domain/finance.repositories.js';
import {
  ACCOUNT_REPOSITORY,
  CATEGORY_REPOSITORY,
  CLOCK,
  CONGREGATION_DIRECTORY,
  ENTRY_REPOSITORY,
  ID_GENERATOR,
  MEMBER_DIRECTORY,
} from './finance.tokens.js';
import { MemberQueriesDirectory } from './infrastructure/member-queries-directory.js';
import { OrganizationQueriesCongregationDirectory } from './infrastructure/organization-queries-congregation-directory.js';
import {
  PrismaAccountRepository,
  PrismaCategoryRepository,
  PrismaEntryRepository,
} from './infrastructure/prisma-finance.repositories.js';
import { FinanceController } from './presentation/http/finance.controller.js';

// Raiz de composição: os casos de uso não têm decorators do Nest (a camada application é pura); aqui cada porta é
// ligada à sua implementação.

const ports = {
  accounts: ACCOUNT_REPOSITORY,
  categories: CATEGORY_REPOSITORY,
  entries: ENTRY_REPOSITORY,
  congregations: CONGREGATION_DIRECTORY,
  members: MEMBER_DIRECTORY,
  ids: ID_GENERATOR,
  clock: CLOCK,
  audit: AUDIT_LOG,
} as const;

interface Ports {
  accounts: AccountRepository;
  categories: CategoryRepository;
  entries: EntryRepository;
  congregations: CongregationDirectory;
  members: MemberDirectory;
  ids: IdGenerator;
  clock: Clock;
  audit: AuditLog;
}

/** Liga um caso de uso às portas que ele pede, na ordem em que o construtor as recebe. */
function provide<T>(
  UseCase: new (...args: never[]) => T,
  wanted: readonly (keyof Ports)[],
): Provider {
  return {
    provide: UseCase,
    useFactory: (...args: unknown[]) =>
      new (UseCase as new (...a: unknown[]) => T)(...args),
    inject: wanted.map((name) => ports[name]),
  };
}

@Module({
  imports: [DatabaseModule, OrganizationModule, MembersModule, AuditModule],
  controllers: [FinanceController],
  providers: [
    {
      provide: ACCOUNT_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaAccountRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CATEGORY_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaCategoryRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: ENTRY_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaEntryRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CONGREGATION_DIRECTORY,
      useFactory: (queries: OrganizationQueries) =>
        new OrganizationQueriesCongregationDirectory(queries),
      inject: [ORGANIZATION_QUERIES],
    },
    {
      provide: MEMBER_DIRECTORY,
      useFactory: (queries: MemberQueries) =>
        new MemberQueriesDirectory(queries),
      inject: [MEMBER_QUERIES],
    },
    { provide: ID_GENERATOR, useFactory: () => new UuidV7IdGenerator() },
    { provide: CLOCK, useFactory: () => new SystemClock() },

    provide(CreateAccountUseCase, [
      'accounts',
      'congregations',
      'ids',
      'audit',
    ]),
    provide(UpdateAccountUseCase, ['accounts', 'audit']),
    provide(ListAccountsUseCase, ['accounts', 'entries']),
    provide(CreateCategoryUseCase, ['categories', 'ids', 'audit']),
    provide(UpdateCategoryUseCase, ['categories', 'audit']),
    provide(ListCategoriesUseCase, ['categories']),
    provide(EnsureDefaultCategoriesUseCase, ['categories', 'ids', 'audit']),
    provide(RecordIncomeUseCase, [
      'accounts',
      'categories',
      'entries',
      'congregations',
      'members',
      'ids',
      'clock',
      'audit',
    ]),
    provide(RequestExpenseUseCase, [
      'accounts',
      'categories',
      'entries',
      'congregations',
      'ids',
      'clock',
      'audit',
    ]),
    provide(RequestOpeningBalanceUseCase, [
      'accounts',
      'entries',
      'congregations',
      'ids',
      'clock',
      'audit',
    ]),
    provide(RequestTransferUseCase, [
      'accounts',
      'entries',
      'congregations',
      'ids',
      'clock',
      'audit',
    ]),
    provide(RequestReversalUseCase, ['entries', 'ids', 'clock', 'audit']),
    provide(ApproveEntryUseCase, [
      'entries',
      'congregations',
      'clock',
      'audit',
    ]),
    provide(RejectEntryUseCase, ['entries', 'congregations', 'clock', 'audit']),
    provide(CancelEntryUseCase, ['entries', 'clock', 'audit']),
    provide(ListEntriesUseCase, ['entries', 'members', 'audit']),
    provide(ListApprovalsUseCase, [
      'entries',
      'congregations',
      'members',
      'audit',
    ]),
    provide(ListTransferDestinationsUseCase, ['accounts', 'congregations']),
    provide(GetDashboardUseCase, ['entries', 'clock']),
    provide(GetMemberContributionsUseCase, ['entries', 'members', 'audit']),
    provide(SearchContributorsUseCase, ['members', 'audit']),
  ],
})
export class FinanceModule {}
