import type { AuditLog } from '../../../shared/application/audit-log.js';
import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { CongregationId } from '../../../shared/domain/identifiers.js';
import { FinanceAccessDeniedError } from '../domain/errors.js';
import type {
  AccountRepository,
  EntryRepository,
} from '../domain/finance.repositories.js';
import {
  FinancialAccount,
  isAccountKind,
} from '../domain/financial-account.js';
import { AccountId } from '../domain/ids.js';
import { balancesByAccount } from './balances.js';
import type { CongregationDirectory } from './directories.js';
import type { FinanceAccess } from './finance-access.js';
import {
  assertActiveCongregation,
  loadWritableAccount,
} from './finance-guards.js';
import { type AccountView, toAccountView } from './views.js';

export interface CreateAccountCommand {
  congregationId: string;
  name: string;
  kind: string;
}

/** UC-11: cria uma conta (caixa ou banco) numa congregação. Exige escrita nela, e a congregação precisa estar ativa. */
export class CreateAccountUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly congregations: CongregationDirectory,
    private readonly ids: IdGenerator,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: CreateAccountCommand,
  ): Promise<{ id: string }> {
    const congregationId = CongregationId.of(command.congregationId);
    // Primeiro a permissão: quem não pode escrever ali não descobre se a congregação existe.
    if (!access.canWrite(congregationId)) throw new FinanceAccessDeniedError();
    if (!isAccountKind(command.kind)) {
      throw new ValidationError('kind', 'O tipo de conta não existe.');
    }
    const account = FinancialAccount.register({
      id: AccountId.of(this.ids.next()),
      organizationId: context.organizationId,
      congregationId,
      name: command.name,
      kind: command.kind,
    });

    await assertActiveCongregation(this.congregations, context, congregationId);
    await this.accounts.add(account);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.account_created',
      entity: 'financial_account',
      entityId: account.id,
      metadata: { congregationId, kind: account.kind },
    });

    return { id: account.id };
  }
}

export interface UpdateAccountCommand {
  accountId: string;
  name?: string;
  /** `true` arquiva, `false` reativa; ausente = não mexe. Conta nunca é apagada (ADR 0005). */
  archived?: boolean;
}

/** UC-11: renomeia, arquiva ou reativa uma conta. Os lançamentos antigos continuam, e o saldo dela continua calculável. */
export class UpdateAccountUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly audit: AuditLog,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    command: UpdateAccountCommand,
  ): Promise<void> {
    const account = await loadWritableAccount(
      this.accounts,
      context,
      access,
      command.accountId,
    );
    if (command.name !== undefined) account.rename(command.name);
    if (command.archived === true) account.archive();
    if (command.archived === false) account.unarchive();

    await this.accounts.save(account);
    await this.audit.record({
      organizationId: context.organizationId,
      actorId: context.actorId,
      action: 'finance.account_updated',
      entity: 'financial_account',
      entityId: account.id,
      metadata: {
        renamed: command.name !== undefined,
        archived: command.archived ?? null,
      },
    });
  }
}

export interface ListAccountsQuery {
  includeArchived?: boolean;
  congregationId?: string | null;
}

/** Lista as contas das congregações que o usuário vê, cada uma com o saldo confirmado. */
export class ListAccountsUseCase {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly entries: EntryRepository,
  ) {}

  async execute(
    context: RequestContext,
    access: FinanceAccess,
    query: ListAccountsQuery,
  ): Promise<AccountView[]> {
    // O ESCOPO do usuário é o teto; o filtro por congregação só pode estreitá-lo.
    const readable = access.readableCongregations();
    let congregationIds = readable === null ? null : [...readable];
    if (query.congregationId) {
      const wanted = CongregationId.of(query.congregationId);
      congregationIds =
        readable === null || readable.includes(wanted) ? [wanted] : [];
    }

    const accounts = await this.accounts.list(context.organizationId, {
      congregationIds,
      includeArchived: query.includeArchived ?? false,
    });
    const balances = balancesByAccount(
      await this.entries.aggregate(context.organizationId, {
        congregationIds,
        from: null,
        to: null,
      }),
    );
    return accounts.map((account) =>
      toAccountView(account, balances.get(account.id) ?? 0),
    );
  }
}
