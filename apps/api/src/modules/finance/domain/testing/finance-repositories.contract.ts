import { beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import { rejectionOf } from '../../../../shared/testing/rejection-of.js';
import {
  AccountNameTakenError,
  AccountNotFoundError,
  AlreadyReversedError,
  CategoryNameTakenError,
  CategoryNotFoundError,
  EntryNotPendingError,
  InsufficientBalanceError,
} from '../errors.js';
import { FinanceCategory } from '../finance-category.js';
import type {
  AccountRepository,
  CategoryRepository,
  EntryRepository,
} from '../finance.repositories.js';
import { FinancialAccount } from '../financial-account.js';
import { LedgerEntry } from '../ledger-entry.js';
import {
  NOW,
  MINUTE,
  accountId,
  aCategory,
  aConfiguration,
  actor,
  after,
  anAccount,
  anExpense,
  anIncome,
  anOpeningBalance,
  approved,
  categoryId,
  congId,
  date,
  entryId,
  member,
  money,
  orgId,
  transferId,
} from './fixtures.js';

export interface FinanceRepositories {
  accounts: AccountRepository;
  categories: CategoryRepository;
  entries: EntryRepository;
}

/**
 * Bateria de testes que QUALQUER implementação dos repositórios do finance precisa passar. Roda contra o fake em memória
 * (testes unitários) e contra o PostgreSQL (integração).
 *
 * `makeRepositories` entrega repositórios vazios, já com o que o banco exige: as igrejas 1 e 2, as congregações 1 a 3 da
 * igreja 1 e a 10 da igreja 2, e os membros 1 a 3 da igreja 1 (ids das `fixtures`). As contas e categorias do cenário
 * (`aConfiguration`) são gravadas por este contrato.
 */
export function describeFinanceRepositoriesContract(
  name: string,
  makeRepositories: () => Promise<FinanceRepositories>,
): void {
  describe(`Repositórios do finance (${name})`, () => {
    let repos: FinanceRepositories;
    const org = orgId(1);
    const other = orgId(2);

    beforeEach(async () => {
      repos = await makeRepositories();
      for (const spec of aConfiguration.accounts) {
        await repos.accounts.add(anAccount(spec.n));
      }
      for (const spec of aConfiguration.categories) {
        await repos.categories.add(aCategory(spec.n));
      }
    });

    describe('contas', () => {
      it('grava e devolve todos os dados', async () => {
        const found = await repos.accounts.findById(org, accountId(2));

        expect(found).toMatchObject({
          id: accountId(2),
          organizationId: org,
          congregationId: congId(1),
          name: 'Conta 2',
          kind: 'BANK',
          status: 'ACTIVE',
          version: 0,
        });
      });

      it('não devolve conta inexistente nem de outra igreja', async () => {
        expect(await repos.accounts.findById(org, accountId(404))).toBeNull();
        expect(await repos.accounts.findById(org, accountId(10))).toBeNull();
        expect(await repos.accounts.findById(other, accountId(1))).toBeNull();
      });

      it('nome único por congregação, sem diferenciar caixa nem espaços', async () => {
        const duplicate = FinancialAccount.register({
          id: accountId(99),
          organizationId: org,
          congregationId: congId(1),
          name: '  CONTA   1 ',
          kind: 'BANK',
        });
        const elsewhere = FinancialAccount.register({
          id: accountId(98),
          organizationId: org,
          congregationId: congId(2),
          name: 'Conta 1',
          kind: 'BANK',
        });

        expect(
          await rejectionOf(() => repos.accounts.add(duplicate)),
        ).toBeInstanceOf(AccountNameTakenError);
        await repos.accounts.add(elsewhere);
      });

      it('save grava as mudanças e incrementa a versão', async () => {
        const account = await repos.accounts.findById(org, accountId(1));
        account?.rename('Caixa principal');
        account?.archive();
        await repos.accounts.save(account as FinancialAccount);

        expect(await repos.accounts.findById(org, accountId(1))).toMatchObject({
          name: 'Caixa principal',
          status: 'ARCHIVED',
          version: 1,
        });
      });

      it('save com versão velha falha (travamento otimista)', async () => {
        const first = await repos.accounts.findById(org, accountId(1));
        const second = await repos.accounts.findById(org, accountId(1));
        first?.rename('Primeiro');
        second?.rename('Segundo');
        await repos.accounts.save(first as FinancialAccount);

        expect(
          await rejectionOf(() =>
            repos.accounts.save(second as FinancialAccount),
          ),
        ).toBeInstanceOf(ConcurrencyConflictError);
      });

      it('renomear para um nome já usado na congregação falha', async () => {
        const account = await repos.accounts.findById(org, accountId(1));
        account?.rename('conta 2');

        expect(
          await rejectionOf(() =>
            repos.accounts.save(account as FinancialAccount),
          ),
        ).toBeInstanceOf(AccountNameTakenError);
      });

      it('save de conta inexistente ou de outra igreja falha', async () => {
        const stranger = FinancialAccount.restore({
          id: accountId(1),
          organizationId: other,
          congregationId: congId(10),
          name: 'X',
          kind: 'CASH',
          status: 'ACTIVE',
          version: 0,
        });

        expect(
          await rejectionOf(() => repos.accounts.save(stranger)),
        ).toBeInstanceOf(AccountNotFoundError);
      });

      it('lista por nome, só do escopo, sem arquivadas por padrão', async () => {
        const archived = await repos.accounts.findById(org, accountId(2));
        archived?.archive();
        await repos.accounts.save(archived as FinancialAccount);

        const all = await repos.accounts.list(org, {
          congregationIds: null,
          includeArchived: false,
        });
        const withArchived = await repos.accounts.list(org, {
          congregationIds: [congId(1)],
          includeArchived: true,
        });
        const none = await repos.accounts.list(org, {
          congregationIds: [],
          includeArchived: true,
        });

        expect(all.map((a) => a.id)).toEqual([
          accountId(1),
          accountId(3),
          accountId(4),
        ]);
        expect(withArchived.map((a) => a.id)).toEqual([
          accountId(1),
          accountId(2),
        ]);
        expect(none).toEqual([]);
      });
    });

    describe('categorias', () => {
      it('grava, devolve e isola por igreja', async () => {
        expect(
          await repos.categories.findById(org, categoryId(3)),
        ).toMatchObject({
          name: 'Aluguel',
          direction: 'OUT',
          status: 'ACTIVE',
          version: 0,
        });
        expect(await repos.categories.findById(org, categoryId(10))).toBeNull();
        expect(
          await repos.categories.findById(other, categoryId(1)),
        ).toBeNull();
      });

      it('nome único por igreja e sentido (o mesmo nome vale no outro sentido e em outra igreja)', async () => {
        const make = (
          n: number,
          org_: typeof org,
          name: string,
          direction: 'IN' | 'OUT',
        ) =>
          FinanceCategory.register({
            id: categoryId(n),
            organizationId: org_,
            name,
            direction,
          });

        expect(
          await rejectionOf(() =>
            repos.categories.add(make(90, org, ' dízimo ', 'IN')),
          ),
        ).toBeInstanceOf(CategoryNameTakenError);
        await repos.categories.add(make(91, org, 'Dízimo', 'OUT'));
        await repos.categories.add(make(92, other, 'Oferta', 'IN'));
      });

      it('save: renomeia, arquiva, conflita por versão e por nome, e falha se não existe', async () => {
        const first = await repos.categories.findById(org, categoryId(1));
        const second = await repos.categories.findById(org, categoryId(1));
        first?.rename('Dízimos');
        first?.archive();
        await repos.categories.save(first as FinanceCategory);

        expect(
          await repos.categories.findById(org, categoryId(1)),
        ).toMatchObject({
          name: 'Dízimos',
          status: 'ARCHIVED',
          version: 1,
        });
        expect(
          await rejectionOf(() =>
            repos.categories.save(second as FinanceCategory),
          ),
        ).toBeInstanceOf(ConcurrencyConflictError);

        const clash = await repos.categories.findById(org, categoryId(2));
        clash?.rename('dízimos');
        expect(
          await rejectionOf(() =>
            repos.categories.save(clash as FinanceCategory),
          ),
        ).toBeInstanceOf(CategoryNameTakenError);

        const ghost = FinanceCategory.restore({
          id: categoryId(404),
          organizationId: org,
          name: 'X',
          direction: 'IN',
          status: 'ACTIVE',
          version: 0,
        });
        expect(
          await rejectionOf(() => repos.categories.save(ghost)),
        ).toBeInstanceOf(CategoryNotFoundError);
      });

      it('lista só as da igreja, sem arquivadas por padrão', async () => {
        const archived = await repos.categories.findById(org, categoryId(4));
        archived?.archive();
        await repos.categories.save(archived as FinanceCategory);

        const active = await repos.categories.list(org, {
          includeArchived: false,
        });
        const all = await repos.categories.list(org, { includeArchived: true });

        expect(active.map((c) => c.id)).toEqual([
          categoryId(1),
          categoryId(2),
          categoryId(3),
        ]);
        expect(all).toHaveLength(4);
      });
    });

    describe('lançamentos: gravação e leitura', () => {
      it('grava e devolve todos os campos de uma entrada com membro', async () => {
        const entry = anIncome({
          id: 1,
          cents: 12_345,
          member: 1,
          description: 'Culto',
          occurredOn: '2026-10-05',
        });
        await repos.entries.add([entry]);

        const found = await repos.entries.findById(org, entryId(1));

        expect(found).toMatchObject({
          id: entryId(1),
          organizationId: org,
          congregationId: congId(1),
          accountId: accountId(1),
          kind: 'ORDINARY',
          direction: 'IN',
          status: 'CONFIRMED',
          categoryId: categoryId(1),
          memberId: member(1),
          description: 'Culto',
          transferId: null,
          reversesEntryId: null,
          requestedBy: actor(1),
          requestedAt: NOW,
          decidedBy: null,
          decidedAt: null,
          decisionNote: null,
        });
        expect(found?.amount.cents).toBe(12_345);
        expect(found?.occurredOn.value).toBe('2026-10-05');
      });

      it('saldo inicial volta sem categoria nem membro', async () => {
        await repos.entries.add([anOpeningBalance({ id: 1, cents: 500 })]);

        expect(await repos.entries.findById(org, entryId(1))).toMatchObject({
          kind: 'OPENING_BALANCE',
          categoryId: null,
          memberId: null,
          status: 'PENDING',
        });
      });

      it('não devolve lançamento inexistente nem de outra igreja', async () => {
        await repos.entries.add([anIncome({ id: 1 })]);

        expect(await repos.entries.findById(org, entryId(404))).toBeNull();
        expect(await repos.entries.findById(other, entryId(1))).toBeNull();
      });

      it('as duas pernas de um repasse são gravadas juntas e achadas pelo repasse', async () => {
        const { out, in: incoming } = LedgerEntry.requestTransfer({
          transferId: transferId(1),
          organizationId: org,
          from: {
            id: entryId(21),
            congregationId: congId(2),
            accountId: accountId(3),
          },
          to: {
            id: entryId(20),
            congregationId: congId(1),
            accountId: accountId(1),
          },
          amount: money(1_000),
          occurredOn: date('2026-10-10'),
          requestedBy: actor(1),
          now: NOW,
        });
        await repos.entries.add([out, incoming]);

        const legs = await repos.entries.findByTransferId(org, transferId(1));

        expect(legs.map((l) => l.id)).toEqual([entryId(20), entryId(21)]);
        expect(legs.map((l) => l.direction)).toEqual(['IN', 'OUT']);
        expect(
          await repos.entries.findByTransferId(other, transferId(1)),
        ).toEqual([]);
      });
    });

    describe('lançamentos: estorno único', () => {
      const reversalOf = (original: LedgerEntry, id: number) =>
        LedgerEntry.requestReversal(original, {
          id: entryId(id),
          occurredOn: date('2026-10-21'),
          requestedBy: actor(2),
          now: NOW,
        });

      it('um lançamento só tem UM estorno pendente ou confirmado', async () => {
        const original = anIncome({ id: 1 });
        await repos.entries.add([original]);
        await repos.entries.add([reversalOf(original, 2)]);

        expect(
          await rejectionOf(() => repos.entries.add([reversalOf(original, 3)])),
        ).toBeInstanceOf(AlreadyReversedError);
      });

      it('o lote é tudo ou nada: se um estorno falha, nada do lote fica', async () => {
        const original = anIncome({ id: 1 });
        await repos.entries
          .add([original, reversalOf(original, 2)])
          .catch(() => undefined);
        const duplicate = reversalOf(original, 4);

        expect(
          await rejectionOf(() =>
            repos.entries.add([anIncome({ id: 5 }), duplicate]),
          ),
        ).toBeInstanceOf(AlreadyReversedError);
        expect(await repos.entries.findById(org, entryId(5))).toBeNull();
      });

      it('estorno recusado ou cancelado libera um novo estorno', async () => {
        const original = anIncome({ id: 1 });
        const first = reversalOf(original, 2);
        await repos.entries.add([original, first]);
        await repos.entries.decide([first.reject(actor(9), 'engano', NOW)]);

        await repos.entries.add([reversalOf(original, 3)]);
        await repos.entries.decide([
          (await repos.entries.findById(org, entryId(3)))?.cancel(
            NOW,
          ) as LedgerEntry,
        ]);

        await repos.entries.add([reversalOf(original, 4)]);
      });
    });

    describe('lançamentos: decisão', () => {
      it('aprovar confirma a saída e grava quem decidiu e quando', async () => {
        await repos.entries.add([
          anIncome({ id: 1, cents: 10_000 }),
          anExpense({ id: 2, cents: 4_000 }),
        ]);
        const decided = (
          await repos.entries.findById(org, entryId(2))
        )?.approve(actor(9), after(NOW, MINUTE)) as LedgerEntry;

        await repos.entries.decide([decided]);

        expect(await repos.entries.findById(org, entryId(2))).toMatchObject({
          status: 'CONFIRMED',
          decidedBy: actor(9),
          decidedAt: after(NOW, MINUTE),
        });
      });

      it('a saída pode zerar a conta, mas não deixá-la negativa', async () => {
        await repos.entries.add([
          anIncome({ id: 1, cents: 10_000 }),
          anExpense({ id: 2, cents: 10_000 }),
          anExpense({ id: 3, cents: 1 }),
        ]);

        await repos.entries.decide([
          approved(anExpense({ id: 2, cents: 10_000 })),
        ]);

        expect(
          await rejectionOf(() =>
            repos.entries.decide([approved(anExpense({ id: 3, cents: 1 }))]),
          ),
        ).toBeInstanceOf(InsufficientBalanceError);
        expect((await repos.entries.findById(org, entryId(3)))?.status).toBe(
          'PENDING',
        );
      });

      it('só conta o que está CONFIRMADO: pedido pendente ou recusado não dá saldo', async () => {
        await repos.entries.add([
          anOpeningBalance({ id: 1, cents: 50_000 }),
          anExpense({ id: 2, cents: 100 }),
        ]);

        expect(
          await rejectionOf(() =>
            repos.entries.decide([approved(anExpense({ id: 2, cents: 100 }))]),
          ),
        ).toBeInstanceOf(InsufficientBalanceError);
      });

      it('o saldo é por conta: dinheiro de outra conta não cobre', async () => {
        await repos.entries.add([
          anIncome({ id: 1, cents: 10_000, account: 2 }),
          anExpense({ id: 2, cents: 100, account: 1 }),
        ]);

        expect(
          await rejectionOf(() =>
            repos.entries.decide([
              approved(anExpense({ id: 2, cents: 100, account: 1 })),
            ]),
          ),
        ).toBeInstanceOf(InsufficientBalanceError);
      });

      it('recusar e cancelar não olham o saldo', async () => {
        await repos.entries.add([
          anExpense({ id: 1, cents: 999 }),
          anExpense({ id: 2, cents: 999 }),
        ]);

        await repos.entries.decide([
          anExpense({ id: 1, cents: 999 }).reject(actor(9), 'não', NOW),
          anExpense({ id: 2, cents: 999 }).cancel(NOW),
        ]);

        expect((await repos.entries.findById(org, entryId(1)))?.status).toBe(
          'REJECTED',
        );
        expect((await repos.entries.findById(org, entryId(2)))?.status).toBe(
          'CANCELLED',
        );
      });

      it('o que já foi decidido não se decide de novo', async () => {
        await repos.entries.add([
          anExpense({ id: 1 }),
          anIncome({ id: 2, cents: 10_000 }),
        ]);
        await repos.entries.decide([
          anExpense({ id: 1 }).reject(actor(9), 'não', NOW),
        ]);

        expect(
          await rejectionOf(() =>
            repos.entries.decide([approved(anExpense({ id: 1 }))]),
          ),
        ).toBeInstanceOf(EntryNotPendingError);
      });

      it('as pernas de um repasse são decididas juntas: se uma falha, nenhuma muda', async () => {
        const { out, in: incoming } = LedgerEntry.requestTransfer({
          transferId: transferId(1),
          organizationId: org,
          from: {
            id: entryId(21),
            congregationId: congId(2),
            accountId: accountId(3),
          },
          to: {
            id: entryId(20),
            congregationId: congId(1),
            accountId: accountId(1),
          },
          amount: money(5_000),
          occurredOn: date('2026-10-10'),
          requestedBy: actor(1),
          now: NOW,
        });
        await repos.entries.add([out, incoming]);

        // A conta 3 não tem saldo: a perna de entrada NÃO pode ter sido confirmada sozinha.
        expect(
          await rejectionOf(() =>
            repos.entries.decide([approved(out), approved(incoming)]),
          ),
        ).toBeInstanceOf(InsufficientBalanceError);
        expect((await repos.entries.findById(org, entryId(20)))?.status).toBe(
          'PENDING',
        );

        await repos.entries.add([
          anIncome({ id: 30, account: 3, cents: 5_000 }),
        ]);
        await repos.entries.decide([approved(out), approved(incoming)]);

        expect(
          (await repos.entries.findByTransferId(org, transferId(1))).map(
            (l) => l.status,
          ),
        ).toEqual(['CONFIRMED', 'CONFIRMED']);
      });
    });

    describe('lançamentos: consultas', () => {
      beforeEach(async () => {
        await repos.entries.add([
          anIncome({
            id: 1,
            account: 1,
            category: 1,
            cents: 10_000,
            occurredOn: '2026-09-10',
            member: 1,
          }),
          anIncome({
            id: 2,
            account: 1,
            category: 2,
            cents: 3_000,
            occurredOn: '2026-10-05',
            member: 2,
          }),
          anIncome({
            id: 3,
            account: 3,
            category: 1,
            cents: 7_000,
            occurredOn: '2026-10-05',
          }),
          anIncome({
            id: 4,
            account: 4,
            category: 1,
            cents: 900,
            occurredOn: '2026-10-12',
            member: 1,
          }),
          anExpense({
            id: 5,
            account: 1,
            category: 3,
            cents: 2_000,
            occurredOn: '2026-10-15',
          }),
          anOpeningBalance({
            id: 6,
            account: 2,
            cents: 8_000,
            occurredOn: '2026-10-01',
          }),
        ]);
        await repos.entries.decide([
          approved(
            anExpense({
              id: 5,
              account: 1,
              category: 3,
              cents: 2_000,
              occurredOn: '2026-10-15',
            }),
          ),
        ]);
        await repos.entries.add([
          // A categoria também é da igreja 2: a chave estrangeira composta do banco recusa a de outra igreja.
          anIncome({ id: 90, account: 10, category: 10, cents: 1_234 }),
        ]);
      });

      const criteria = {
        congregationIds: null,
        accountId: null,
        status: null,
        categoryId: null,
        from: null,
        to: null,
        limit: 50,
        offset: 0,
      } as const;

      it('search ordena do mais recente para o mais antigo e isola por igreja', async () => {
        const page = await repos.entries.search(org, criteria);

        expect(page.total).toBe(6);
        expect(page.items.map((e) => e.id)).toEqual([
          entryId(5),
          entryId(4),
          entryId(3),
          entryId(2),
          entryId(6),
          entryId(1),
        ]);
      });

      it('search filtra por escopo, conta, status, categoria e período (inclusivo)', async () => {
        const ids = async (override: Record<string, unknown>) =>
          (
            await repos.entries.search(org, { ...criteria, ...override })
          ).items.map((e) => e.id);

        expect(await ids({ congregationIds: [congId(2)] })).toEqual([
          entryId(3),
        ]);
        expect(await ids({ congregationIds: [] })).toEqual([]);
        expect(await ids({ accountId: accountId(2) })).toEqual([entryId(6)]);
        expect(await ids({ status: 'PENDING' })).toEqual([entryId(6)]);
        expect(await ids({ categoryId: categoryId(2) })).toEqual([entryId(2)]);
        expect(
          await ids({ from: date('2026-10-05'), to: date('2026-10-12') }),
        ).toEqual([entryId(4), entryId(3), entryId(2)]);
      });

      it('search pagina e informa o total', async () => {
        const page = await repos.entries.search(org, {
          ...criteria,
          limit: 2,
          offset: 1,
        });

        expect(page.total).toBe(6);
        expect(page.items.map((e) => e.id)).toEqual([entryId(4), entryId(3)]);
      });

      it('aggregate soma só os CONFIRMADOS, agrupados', async () => {
        const rows = await repos.entries.aggregate(org, {
          congregationIds: null,
          from: null,
          to: null,
        });
        const find = (
          account: number,
          direction: 'IN' | 'OUT',
          category: number | null,
        ) =>
          rows.find(
            (r) =>
              r.accountId === accountId(account) &&
              r.direction === direction &&
              r.categoryId ===
                (category === null ? null : categoryId(category)),
          );

        expect(find(1, 'IN', 1)).toMatchObject({
          totalCents: 10_000,
          count: 1,
          kind: 'ORDINARY',
          congregationId: congId(1),
        });
        expect(find(1, 'OUT', 3)).toMatchObject({
          totalCents: 2_000,
          count: 1,
        });
        expect(find(2, 'IN', null)).toBeUndefined();
        expect(rows.reduce((sum, r) => sum + r.count, 0)).toBe(5);
      });

      it('aggregate respeita escopo e período', async () => {
        const scoped = await repos.entries.aggregate(org, {
          congregationIds: [congId(2), congId(3)],
          from: null,
          to: null,
        });
        const october = await repos.entries.aggregate(org, {
          congregationIds: null,
          from: date('2026-10-01'),
          to: date('2026-10-31'),
        });

        expect(scoped.map((r) => r.accountId).sort()).toEqual(
          [accountId(3), accountId(4)].sort(),
        );
        expect(
          october.find(
            (r) =>
              r.accountId === accountId(1) && r.categoryId === categoryId(1),
          ),
        ).toBeUndefined();
        expect(
          await repos.entries.aggregate(org, {
            congregationIds: [],
            from: null,
            to: null,
          }),
        ).toEqual([]);
      });

      it('countPending conta os pedidos aguardando, no escopo', async () => {
        expect(await repos.entries.countPending(org, null)).toBe(1);
        expect(await repos.entries.countPending(org, [congId(1)])).toBe(1);
        expect(await repos.entries.countPending(org, [congId(2)])).toBe(0);
        expect(await repos.entries.countPending(org, [])).toBe(0);
        expect(await repos.entries.countPending(other, null)).toBe(0);
      });

      it('listByMember devolve só confirmados do membro, do mais recente ao mais antigo, no escopo e na janela', async () => {
        const base = { congregationIds: null, since: null };

        const all = await repos.entries.listByMember(org, member(1), base);
        const recent = await repos.entries.listByMember(org, member(1), {
          ...base,
          since: date('2026-10-01'),
        });
        const scoped = await repos.entries.listByMember(org, member(1), {
          congregationIds: [congId(1)],
          since: null,
        });

        expect(all.map((e) => e.id)).toEqual([entryId(4), entryId(1)]);
        expect(recent.map((e) => e.id)).toEqual([entryId(4)]);
        expect(scoped.map((e) => e.id)).toEqual([entryId(1)]);
        expect(
          await repos.entries.listByMember(org, member(1), {
            congregationIds: [],
            since: null,
          }),
        ).toEqual([]);
        expect(
          await repos.entries.listByMember(other, member(1), base),
        ).toEqual([]);
      });
    });
  });
}
