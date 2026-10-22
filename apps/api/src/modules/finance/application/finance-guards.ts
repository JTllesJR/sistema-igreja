import type { RequestContext } from '../../../shared/application/request-context.js';
import type { CongregationId } from '../../../shared/domain/identifiers.js';
import {
  AccountNotFoundError,
  AccountUnavailableError,
  CategoryNotFoundError,
  CategoryUnavailableError,
  CongregationUnavailableError,
  FinanceAccessDeniedError,
} from '../domain/errors.js';
import type { FinanceCategory } from '../domain/finance-category.js';
import type { EntryDirection } from '../domain/finance-category.js';
import type { CategoryRepository } from '../domain/finance.repositories.js';
import type { AccountRepository } from '../domain/finance.repositories.js';
import type { FinancialAccount } from '../domain/financial-account.js';
import { AccountId, CategoryId } from '../domain/ids.js';
import type { CongregationDirectory } from './directories.js';
import type { FinanceAccess } from './finance-access.js';

/**
 * Carrega a conta pedida, só se for desta igreja E de uma congregação que o usuário pode ver. Do contrário é "não
 * encontrada": quem não pode ver não descobre nem que a conta existe.
 */
export async function loadVisibleAccount(
  accounts: AccountRepository,
  context: RequestContext,
  access: FinanceAccess,
  rawAccountId: string,
): Promise<FinancialAccount> {
  const account = await accounts.findById(
    context.organizationId,
    AccountId.of(rawAccountId),
  );
  if (!account || !access.canRead(account.congregationId)) {
    throw new AccountNotFoundError();
  }
  return account;
}

/** A conta é visível E o usuário pode LANÇAR na congregação dela. */
export async function loadWritableAccount(
  accounts: AccountRepository,
  context: RequestContext,
  access: FinanceAccess,
  rawAccountId: string,
): Promise<FinancialAccount> {
  const account = await loadVisibleAccount(
    accounts,
    context,
    access,
    rawAccountId,
  );
  if (!access.canWrite(account.congregationId)) {
    throw new FinanceAccessDeniedError();
  }
  return account;
}

/** Conta arquivada ou congregação desativada não recebem lançamentos novos. */
export async function assertCanReceiveEntries(
  directory: CongregationDirectory,
  context: RequestContext,
  account: FinancialAccount,
): Promise<void> {
  if (!account.isActive) throw new AccountUnavailableError();
  await assertActiveCongregation(directory, context, account.congregationId);
}

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

/** A categoria existe nesta igreja, está ativa e serve ao sentido do lançamento. */
export async function loadUsableCategory(
  categories: CategoryRepository,
  context: RequestContext,
  rawCategoryId: string,
  direction: EntryDirection,
): Promise<FinanceCategory> {
  const category = await categories.findById(
    context.organizationId,
    CategoryId.of(rawCategoryId),
  );
  if (!category) throw new CategoryNotFoundError();
  if (!category.isActive || category.direction !== direction) {
    throw new CategoryUnavailableError();
  }
  return category;
}
