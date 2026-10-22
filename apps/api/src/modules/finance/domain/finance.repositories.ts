import type { CalendarDate } from '../../../shared/domain/calendar-date.js';
import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import type { EntryDirection, FinanceCategory } from './finance-category.js';
import type { FinancialAccount } from './financial-account.js';
import type { AccountId, CategoryId, EntryId, TransferId } from './ids.js';
import type {
  EntryKind,
  EntryStatus,
  LedgerEntry,
  MemberRef,
} from './ledger-entry.js';

/**
 * Porta de persistência de `FinancialAccount`. Toda consulta é filtrada pela igreja (ADR 0003).
 *
 * Contrato (verificado por `describeFinanceRepositoriesContract`):
 *  - `add` falha com `AccountNameTakenError` se a congregação já tem uma conta com o mesmo nome (sem diferenciar caixa).
 *  - `save` tem travamento otimista por `version` (`ConcurrencyConflictError`) e falha com `AccountNotFoundError` se não existe.
 *  - `findById` devolve `null` para conta inexistente OU de outra igreja.
 *  - `list` ordena por nome; `congregationIds: null` = a igreja toda, lista vazia = nenhuma.
 */
export interface AccountRepository {
  findById(
    organizationId: OrganizationId,
    id: AccountId,
  ): Promise<FinancialAccount | null>;
  add(account: FinancialAccount): Promise<void>;
  save(account: FinancialAccount): Promise<void>;
  list(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      includeArchived: boolean;
    },
  ): Promise<FinancialAccount[]>;
}

/**
 * Porta de persistência de `FinanceCategory` (mesmo contrato de nome único, por igreja e sentido). `list` ordena entradas
 * antes de saídas e, dentro do sentido, por nome.
 */
export interface CategoryRepository {
  findById(
    organizationId: OrganizationId,
    id: CategoryId,
  ): Promise<FinanceCategory | null>;
  add(category: FinanceCategory): Promise<void>;
  save(category: FinanceCategory): Promise<void>;
  list(
    organizationId: OrganizationId,
    criteria: { includeArchived: boolean },
  ): Promise<FinanceCategory[]>;
}

export interface EntrySearchCriteria {
  /** `null` = a igreja toda; lista vazia = nenhuma. É assim que o ESCOPO do usuário chega ao banco (ADR 0004). */
  congregationIds: readonly CongregationId[] | null;
  accountId: AccountId | null;
  status: EntryStatus | null;
  categoryId: CategoryId | null;
  from: CalendarDate | null;
  to: CalendarDate | null;
  limit: number;
  offset: number;
}

export interface EntryPage {
  items: LedgerEntry[];
  total: number;
}

/** Soma de lançamentos CONFIRMADOS de um mesmo grupo. A aplicação dobra estas linhas em saldos e painéis. */
export interface AggregateRow {
  congregationId: CongregationId;
  accountId: AccountId;
  categoryId: CategoryId | null;
  kind: EntryKind;
  direction: EntryDirection;
  totalCents: number;
  count: number;
}

/**
 * Porta de persistência de `LedgerEntry`. Toda consulta é filtrada pela igreja (ADR 0003).
 *
 * Contrato (verificado por `describeFinanceRepositoriesContract`):
 *  - `add` grava UM ou VÁRIOS lançamentos (as duas pernas de um repasse) juntos: tudo ou nada. Falha com
 *    `AlreadyReversedError` se o lançamento estornado já tem um estorno pendente ou confirmado.
 *  - `decide` grava a DECISÃO (confirmar, recusar ou cancelar) de lançamentos que estavam pendentes, todos na mesma
 *    transação. Falha com `EntryNotPendingError` se algum já foi decidido por outro, e, ao CONFIRMAR uma saída, com
 *    `InsufficientBalanceError` se a conta ficaria negativa (o saldo é conferido com as contas TRAVADAS, então duas
 *    aprovações simultâneas não passam juntas). Tudo ou nada.
 *  - `search` ordena do mais recente para o mais antigo (data do fato, depois id).
 *  - `aggregate` soma só os CONFIRMADOS, agrupados; `to` inclusive, `from` nulo = desde o início.
 *  - `listByMember` devolve os lançamentos CONFIRMADOS ligados a um membro (entradas e estornos), do mais recente para o
 *    mais antigo, só das congregações permitidas e a partir de `since`.
 */
export interface EntryRepository {
  findById(
    organizationId: OrganizationId,
    id: EntryId,
  ): Promise<LedgerEntry | null>;
  findByTransferId(
    organizationId: OrganizationId,
    transferId: TransferId,
  ): Promise<LedgerEntry[]>;
  add(entries: readonly LedgerEntry[]): Promise<void>;
  decide(entries: readonly LedgerEntry[]): Promise<void>;
  search(
    organizationId: OrganizationId,
    criteria: EntrySearchCriteria,
  ): Promise<EntryPage>;
  aggregate(
    organizationId: OrganizationId,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      from: CalendarDate | null;
      to: CalendarDate | null;
    },
  ): Promise<AggregateRow[]>;
  countPending(
    organizationId: OrganizationId,
    congregationIds: readonly CongregationId[] | null,
  ): Promise<number>;
  listByMember(
    organizationId: OrganizationId,
    memberId: MemberRef,
    criteria: {
      congregationIds: readonly CongregationId[] | null;
      since: CalendarDate | null;
    },
  ): Promise<LedgerEntry[]>;
}
