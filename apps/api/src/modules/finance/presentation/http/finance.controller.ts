import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type Account,
  type Category,
  type Contributor,
  type CreateAccountRequest,
  createAccountRequestSchema,
  type CreateCategoryRequest,
  createCategoryRequestSchema,
  type Dashboard,
  type DashboardQuery,
  dashboardQuerySchema,
  type DefaultCategoriesResult,
  type EntryListResponse,
  type FinanceCreated,
  type ListAccountsQuery,
  listAccountsQuerySchema,
  type ListApprovalsQuery,
  listApprovalsQuerySchema,
  type ListCategoriesQuery,
  listCategoriesQuerySchema,
  type ListEntriesQuery,
  listEntriesQuerySchema,
  type MemberContributions,
  type MemberContributionsQuery,
  memberContributionsQuerySchema,
  type RecordIncomeRequest,
  recordIncomeRequestSchema,
  type RejectEntryRequest,
  rejectEntryRequestSchema,
  type RequestExpenseRequest,
  requestExpenseRequestSchema,
  type RequestOpeningBalanceRequest,
  requestOpeningBalanceRequestSchema,
  type RequestReversalRequest,
  requestReversalRequestSchema,
  type RequestTransferRequest,
  requestTransferRequestSchema,
  type SearchContributorsQuery,
  searchContributorsQuerySchema,
  type TransferCreated,
  type TransferDestination,
  type TransferDestinationsQuery,
  transferDestinationsQuerySchema,
  type UpdateAccountRequest,
  updateAccountRequestSchema,
  type UpdateCategoryRequest,
  updateCategoryRequestSchema,
  accountSchema,
  categorySchema,
  contributorSchema,
  dashboardSchema,
  defaultCategoriesResultSchema,
  entryListResponseSchema,
  financeCreatedSchema,
  memberContributionsSchema,
  transferCreatedSchema,
  transferDestinationSchema,
} from '@igreja/contracts';
import { z } from 'zod';
import {
  CurrentContext,
  RequirePermission,
} from '../../../../platform/http/access-control.js';
import { ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import type { RequestContext } from '../../../../shared/application/request-context.js';
// Só a API pública do módulo `identity-access` (ADR 0001).
import {
  type AccessPolicy,
  CurrentPolicy,
} from '../../../identity-access/index.js';
import {
  CreateAccountUseCase,
  ListAccountsUseCase,
  UpdateAccountUseCase,
} from '../../application/account.use-cases.js';
import {
  CreateCategoryUseCase,
  EnsureDefaultCategoriesUseCase,
  ListCategoriesUseCase,
  UpdateCategoryUseCase,
} from '../../application/category.use-cases.js';
import {
  GetMemberContributionsUseCase,
  SearchContributorsUseCase,
} from '../../application/contributions.use-cases.js';
import { GetDashboardUseCase } from '../../application/dashboard.use-case.js';
import {
  ApproveEntryUseCase,
  CancelEntryUseCase,
  RejectEntryUseCase,
} from '../../application/decide-entries.use-cases.js';
import {
  ListApprovalsUseCase,
  ListEntriesUseCase,
  ListTransferDestinationsUseCase,
} from '../../application/list-entries.use-cases.js';
import {
  RecordIncomeUseCase,
  RequestExpenseUseCase,
  RequestOpeningBalanceUseCase,
  RequestReversalUseCase,
  RequestTransferUseCase,
} from '../../application/record-entries.use-cases.js';
import {
  FINANCE_APPROVE,
  FINANCE_READ,
  FINANCE_READ_INDIVIDUAL,
  FINANCE_WRITE,
} from '../../finance.permissions.js';
import { financeAccessFrom } from './finance-access.factory.js';
import { ApiDoc } from '../../../../platform/openapi/api-doc.decorator.js';

const idPipe = new ZodValidationPipe(z.uuid());

// Contra raspagem de dados: quem lê muito e rápido é suspeito. Limite por IP e por rota, além do global (ADR 0011).
const MINUTE_MS = 60_000;
const READ_LIMIT = { default: { limit: 60, ttl: MINUTE_MS } };
// Leituras que revelam QUEM contribuiu: limite mais apertado.
const SENSITIVE_READ_LIMIT = { default: { limit: 30, ttl: MINUTE_MS } };

const ORGANIZATION_WIDE = { organizationWide: true };

/**
 * Adaptador HTTP do financeiro (UC-11 a UC-16, ADR 0015). A igreja vem do token; o escopo de congregações vem da política
 * do usuário (`financeAccessFrom`) e chega até a consulta ao banco. O que o usuário não pode ver responde 404, igual a um
 * inexistente. Quem contribuiu é dado sensível: só aparece com `finance:read-individual`, e toda leitura é auditada.
 */
@Controller('finance')
export class FinanceController {
  constructor(
    @Inject(CreateAccountUseCase)
    private readonly createAccount: CreateAccountUseCase,
    @Inject(UpdateAccountUseCase)
    private readonly updateAccount: UpdateAccountUseCase,
    @Inject(ListAccountsUseCase)
    private readonly listAccounts: ListAccountsUseCase,
    @Inject(CreateCategoryUseCase)
    private readonly createCategory: CreateCategoryUseCase,
    @Inject(UpdateCategoryUseCase)
    private readonly updateCategory: UpdateCategoryUseCase,
    @Inject(ListCategoriesUseCase)
    private readonly listCategories: ListCategoriesUseCase,
    @Inject(EnsureDefaultCategoriesUseCase)
    private readonly ensureDefaults: EnsureDefaultCategoriesUseCase,
    @Inject(RecordIncomeUseCase)
    private readonly recordIncome: RecordIncomeUseCase,
    @Inject(RequestExpenseUseCase)
    private readonly requestExpense: RequestExpenseUseCase,
    @Inject(RequestOpeningBalanceUseCase)
    private readonly requestOpeningBalance: RequestOpeningBalanceUseCase,
    @Inject(RequestTransferUseCase)
    private readonly requestTransfer: RequestTransferUseCase,
    @Inject(RequestReversalUseCase)
    private readonly requestReversal: RequestReversalUseCase,
    @Inject(ApproveEntryUseCase)
    private readonly approveEntry: ApproveEntryUseCase,
    @Inject(RejectEntryUseCase)
    private readonly rejectEntry: RejectEntryUseCase,
    @Inject(CancelEntryUseCase)
    private readonly cancelEntry: CancelEntryUseCase,
    @Inject(ListEntriesUseCase)
    private readonly listEntries: ListEntriesUseCase,
    @Inject(ListApprovalsUseCase)
    private readonly listApprovals: ListApprovalsUseCase,
    @Inject(ListTransferDestinationsUseCase)
    private readonly listDestinations: ListTransferDestinationsUseCase,
    @Inject(GetDashboardUseCase)
    private readonly dashboard: GetDashboardUseCase,
    @Inject(GetMemberContributionsUseCase)
    private readonly memberContributions: GetMemberContributionsUseCase,
    @Inject(SearchContributorsUseCase)
    private readonly searchContributors: SearchContributorsUseCase,
  ) {}

  // ---- Contas e categorias (UC-11) -------------------------------------------------------------------------------

  @RequirePermission(FINANCE_READ)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary: 'Lista as contas (caixa e banco) com o saldo confirmado.',
    response: z.array(accountSchema),
  })
  @Get('accounts')
  accounts(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(listAccountsQuerySchema))
    query: ListAccountsQuery,
  ): Promise<Account[]> {
    return this.listAccounts.execute(context, financeAccessFrom(policy), query);
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Cria uma conta numa congregação.',
    response: financeCreatedSchema,
  })
  @Post('accounts')
  newAccount(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Body(new ZodValidationPipe(createAccountRequestSchema))
    body: CreateAccountRequest,
  ): Promise<FinanceCreated> {
    return this.createAccount.execute(context, financeAccessFrom(policy), body);
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Renomeia, arquiva ou reativa uma conta.',
    description: 'Conta nunca é apagada.',
    response: null,
  })
  @Patch('accounts/:id')
  @HttpCode(204)
  async editAccount(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateAccountRequestSchema))
    body: UpdateAccountRequest,
  ): Promise<void> {
    await this.updateAccount.execute(context, financeAccessFrom(policy), {
      ...body,
      accountId: id,
    });
  }

  @RequirePermission(FINANCE_READ)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary: 'Lista as categorias de entrada e de saída.',
    response: z.array(categorySchema),
  })
  @Get('categories')
  categories(
    @CurrentContext() context: RequestContext,
    @Query(new ZodValidationPipe(listCategoriesQuerySchema))
    query: ListCategoriesQuery,
  ): Promise<Category[]> {
    return this.listCategories.execute(context, query);
  }

  // Categorias são da igreja toda: criar e alterar exigem escrita na igreja toda (o guard confere antes de tudo).
  @RequirePermission(FINANCE_WRITE, ORGANIZATION_WIDE)
  @ApiDoc({
    summary: 'Cria uma categoria.',
    response: financeCreatedSchema,
  })
  @Post('categories')
  newCategory(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Body(new ZodValidationPipe(createCategoryRequestSchema))
    body: CreateCategoryRequest,
  ): Promise<FinanceCreated> {
    return this.createCategory.execute(
      context,
      financeAccessFrom(policy),
      body,
    );
  }

  @RequirePermission(FINANCE_WRITE, ORGANIZATION_WIDE)
  @ApiDoc({
    summary:
      'Cria as categorias padrão que faltam (dízimo, oferta, aluguel...).',
    description: 'Idempotente: nunca duplica nem mexe nas que a igreja já tem.',
    response: defaultCategoriesResultSchema,
  })
  @Post('categories/defaults')
  @HttpCode(200)
  defaultCategories(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
  ): Promise<DefaultCategoriesResult> {
    return this.ensureDefaults.execute(context, financeAccessFrom(policy));
  }

  @RequirePermission(FINANCE_WRITE, ORGANIZATION_WIDE)
  @ApiDoc({
    summary: 'Renomeia, arquiva ou reativa uma categoria.',
    response: null,
  })
  @Patch('categories/:id')
  @HttpCode(204)
  async editCategory(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(updateCategoryRequestSchema))
    body: UpdateCategoryRequest,
  ): Promise<void> {
    await this.updateCategory.execute(context, financeAccessFrom(policy), {
      ...body,
      categoryId: id,
    });
  }

  // ---- Lançamentos (UC-12, UC-13, UC-14) -------------------------------------------------------------------------

  @RequirePermission(FINANCE_READ)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary: 'Lista os lançamentos das congregações que o usuário vê.',
    description:
      'Quem contribuiu só aparece com `finance:read-individual`; essa leitura é auditada antes de devolver.',
    response: entryListResponseSchema,
  })
  @Get('entries')
  entries(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(listEntriesQuerySchema))
    query: ListEntriesQuery,
  ): Promise<EntryListResponse> {
    return this.listEntries.execute(context, financeAccessFrom(policy), query);
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Registra uma entrada (dízimo, oferta...).',
    description:
      'Vale na hora: entrada não precisa de aprovação. Ligar um membro exige `finance:read-individual`.',
    response: financeCreatedSchema,
  })
  @Post('entries/income')
  income(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Body(new ZodValidationPipe(recordIncomeRequestSchema))
    body: RecordIncomeRequest,
  ): Promise<FinanceCreated> {
    return this.recordIncome.execute(context, financeAccessFrom(policy), body);
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Pede uma saída.',
    description: 'Nasce PENDENTE: só vale quando outra pessoa da sede aprovar.',
    response: financeCreatedSchema,
  })
  @Post('entries/expenses')
  expense(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Body(new ZodValidationPipe(requestExpenseRequestSchema))
    body: RequestExpenseRequest,
  ): Promise<FinanceCreated> {
    return this.requestExpense.execute(
      context,
      financeAccessFrom(policy),
      body,
    );
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Pede o saldo inicial de uma conta.',
    description: 'Nasce PENDENTE e espera a sede, como uma saída.',
    response: financeCreatedSchema,
  })
  @Post('entries/opening-balances')
  openingBalance(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Body(new ZodValidationPipe(requestOpeningBalanceRequestSchema))
    body: RequestOpeningBalanceRequest,
  ): Promise<FinanceCreated> {
    return this.requestOpeningBalance.execute(
      context,
      financeAccessFrom(policy),
      body,
    );
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Pede um repasse entre a sede e uma congregação.',
    description: 'Cria duas pernas pendentes que a sede decide juntas.',
    response: transferCreatedSchema,
  })
  @Post('entries/transfers')
  transfer(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Body(new ZodValidationPipe(requestTransferRequestSchema))
    body: RequestTransferRequest,
  ): Promise<TransferCreated> {
    return this.requestTransfer.execute(
      context,
      financeAccessFrom(policy),
      body,
    );
  }

  @RequirePermission(FINANCE_WRITE)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary: 'Lista as contas que podem receber um repasse da conta informada.',
    description: 'Mostra só nome e tipo, sem saldo.',
    response: z.array(transferDestinationSchema),
  })
  @Get('transfer-destinations')
  destinations(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(transferDestinationsQuerySchema))
    query: TransferDestinationsQuery,
  ): Promise<TransferDestination[]> {
    return this.listDestinations.execute(
      context,
      financeAccessFrom(policy),
      query,
    );
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Pede o estorno de um lançamento confirmado.',
    description:
      'Cria um lançamento de sentido oposto, ligado ao original (uma vez só), que nasce PENDENTE.',
    response: financeCreatedSchema,
  })
  @Post('entries/:id/reversal')
  reversal(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(requestReversalRequestSchema))
    body: RequestReversalRequest,
  ): Promise<FinanceCreated> {
    return this.requestReversal.execute(context, financeAccessFrom(policy), {
      ...body,
      entryId: id,
    });
  }

  @RequirePermission(FINANCE_WRITE)
  @ApiDoc({
    summary: 'Desiste de um pedido pendente.',
    description: 'Quem pediu, ou quem tem escrita na congregação.',
    response: null,
  })
  @Post('entries/:id/cancel')
  @HttpCode(204)
  async cancel(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
  ): Promise<void> {
    await this.cancelEntry.execute(context, financeAccessFrom(policy), {
      entryId: id,
    });
  }

  // ---- Aprovação da sede -----------------------------------------------------------------------------------------

  @RequirePermission(FINANCE_APPROVE)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary:
      'Lista a fila da sede: pedidos pendentes de todas as congregações.',
    response: entryListResponseSchema,
  })
  @Get('approvals')
  approvals(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(listApprovalsQuerySchema))
    query: ListApprovalsQuery,
  ): Promise<EntryListResponse> {
    return this.listApprovals.execute(
      context,
      financeAccessFrom(policy),
      query,
    );
  }

  @RequirePermission(FINANCE_APPROVE)
  @ApiDoc({
    summary: 'Aprova um pedido pendente.',
    description:
      'Outra pessoa que não quem pediu. Num repasse, aprova as duas pernas. O saldo da conta nunca fica negativo.',
    response: null,
  })
  @Post('entries/:id/approve')
  @HttpCode(204)
  async approve(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
  ): Promise<void> {
    await this.approveEntry.execute(context, financeAccessFrom(policy), {
      entryId: id,
    });
  }

  @RequirePermission(FINANCE_APPROVE)
  @ApiDoc({
    summary: 'Recusa um pedido pendente, com motivo.',
    description: 'Num repasse, recusa as duas pernas.',
    response: null,
  })
  @Post('entries/:id/reject')
  @HttpCode(204)
  async reject(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Body(new ZodValidationPipe(rejectEntryRequestSchema))
    body: RejectEntryRequest,
  ): Promise<void> {
    await this.rejectEntry.execute(context, financeAccessFrom(policy), {
      entryId: id,
      note: body.note,
    });
  }

  // ---- Painel (UC-15, UC-16) -------------------------------------------------------------------------------------

  @RequirePermission(FINANCE_READ)
  @Throttle(READ_LIMIT)
  @ApiDoc({
    summary:
      'Painel financeiro: receita, despesa, saldos, repasses e pedidos pendentes.',
    description:
      'Sem `congregationId`, soma tudo o que o usuário pode ver (visão consolidada para quem vê a igreja toda).',
    response: dashboardSchema,
  })
  @Get('dashboard')
  summary(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(dashboardQuerySchema))
    query: DashboardQuery,
  ): Promise<Dashboard> {
    return this.dashboard.execute(context, financeAccessFrom(policy), query);
  }

  // ---- Contribuição individual (dado sensível: leitura auditada, falha fechada) ----------------------------------

  @RequirePermission(FINANCE_READ_INDIVIDUAL)
  @Throttle(SENSITIVE_READ_LIMIT)
  @ApiDoc({
    summary: 'Busca mínima de membro para ligar a uma contribuição.',
    description:
      'Só id, nome e congregação; a leitura é auditada (sem o termo).',
    response: z.array(contributorSchema),
  })
  @Get('members/search')
  contributors(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Query(new ZodValidationPipe(searchContributorsQuerySchema))
    query: SearchContributorsQuery,
  ): Promise<Contributor[]> {
    return this.searchContributors.execute(
      context,
      financeAccessFrom(policy),
      query,
    );
  }

  @RequirePermission(FINANCE_READ_INDIVIDUAL)
  @Throttle(SENSITIVE_READ_LIMIT)
  @ApiDoc({
    summary: 'Extrato de contribuição de um membro.',
    description:
      'DADO SENSÍVEL: leitura auditada ANTES de devolver (falha fechada).',
    response: memberContributionsSchema,
  })
  @Get('members/:id/contributions')
  contributions(
    @CurrentContext() context: RequestContext,
    @CurrentPolicy() policy: AccessPolicy,
    @Param('id', idPipe) id: string,
    @Query(new ZodValidationPipe(memberContributionsQuerySchema))
    query: MemberContributionsQuery,
  ): Promise<MemberContributions> {
    return this.memberContributions.execute(
      context,
      financeAccessFrom(policy),
      { memberId: id, since: query.since ?? null },
    );
  }
}
