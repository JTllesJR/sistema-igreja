import { beforeEach, describe, expect, it } from 'vitest';
import {
  ActorId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import type { AuditQueryRepository } from '../audit-query.repository.js';
import type { AuditRecord, AuditSearchCriteria } from '../audit-record.js';

export const orgId = (n = 1): OrganizationId => OrganizationId.of(uuidFor(n));
export const actor = (n: number): ActorId => ActorId.of(uuidFor(100 + n));
export const recordId = (n: number): string => uuidFor(1000 + n);
export const entityOf = (n: number): string => uuidFor(2000 + n);
const at = (iso: string): Date => new Date(iso);

export function aRecord(
  n: number,
  over: Partial<AuditRecord> & { at?: string } = {},
): AuditRecord {
  const { at: instant, ...rest } = over;
  return {
    id: recordId(n),
    organizationId: orgId(1),
    actorId: actor(1),
    action: 'member.viewed',
    entity: 'member',
    entityId: entityOf(1),
    metadata: null,
    occurredAt: at(instant ?? '2026-10-20T12:00:00.000Z'),
    ...rest,
  };
}

export const everything: AuditSearchCriteria = {
  actorId: null,
  entity: null,
  entityId: null,
  action: null,
  module: null,
  from: null,
  to: null,
  before: null,
  limit: 100,
};

export interface AuditQueryHarness {
  repository: AuditQueryRepository;
  /** Grava registros diretamente, com o instante escolhido (a trilha de verdade só deixa o BANCO escolher a hora). */
  seed(records: AuditRecord[]): Promise<void>;
}

/**
 * Bateria que QUALQUER implementação de `AuditQueryRepository` precisa passar (em memória e PostgreSQL).
 * `make` entrega uma trilha vazia; no banco, as igrejas `orgId(1)` e `orgId(2)` já existem.
 */
export function describeAuditQueryContract(
  name: string,
  make: () => Promise<AuditQueryHarness>,
): void {
  describe(`AuditQueryRepository (${name})`, () => {
    let h: AuditQueryHarness;
    const ids = async (
      criteria: Partial<AuditSearchCriteria>,
      org = orgId(1),
    ) =>
      (await h.repository.search(org, { ...everything, ...criteria })).map(
        (r) => r.id,
      );

    beforeEach(async () => {
      h = await make();
    });

    it('devolve tudo o que foi gravado, com todos os campos', async () => {
      const record = aRecord(1, {
        action: 'finance.income_recorded',
        entity: 'financial_entry',
        metadata: { amountCents: 500, identified: true, note: null },
      });
      await h.seed([record]);

      const [found] = await h.repository.search(orgId(1), everything);

      expect(found).toEqual(record);
    });

    it('ordena do mais recente para o mais antigo; no empate de instante, pelo id decrescente', async () => {
      await h.seed([
        aRecord(1, { at: '2026-10-20T10:00:00.000Z' }),
        aRecord(2, { at: '2026-10-20T12:00:00.000Z' }),
        aRecord(3, { at: '2026-10-20T12:00:00.000Z' }),
        aRecord(4, { at: '2026-10-20T11:00:00.000Z' }),
      ]);

      expect(await ids({})).toEqual([
        recordId(3),
        recordId(2),
        recordId(4),
        recordId(1),
      ]);
    });

    it('NUNCA devolve registro de outra igreja', async () => {
      await h.seed([aRecord(1), aRecord(2, { organizationId: orgId(2) })]);

      expect(await ids({})).toEqual([recordId(1)]);
      expect(await ids({}, orgId(2))).toEqual([recordId(2)]);
      expect(await ids({ entityId: entityOf(1) }, orgId(3))).toEqual([]);
    });

    it('filtra por quem fez, tipo, dado afetado e ação exata', async () => {
      await h.seed([
        aRecord(1, { actorId: actor(1) }),
        aRecord(2, {
          actorId: actor(2),
          entity: 'financial_entry',
          entityId: entityOf(2),
          action: 'finance.entry_approved',
        }),
        aRecord(3, {
          actorId: actor(2),
          action: 'member.listed',
          entityId: null,
        }),
      ]);

      expect(await ids({ actorId: actor(2) })).toEqual([
        recordId(3),
        recordId(2),
      ]);
      expect(await ids({ entity: 'financial_entry' })).toEqual([recordId(2)]);
      expect(await ids({ entityId: entityOf(2) })).toEqual([recordId(2)]);
      expect(await ids({ action: 'member.listed' })).toEqual([recordId(3)]);
      expect(await ids({ actorId: actor(2), entity: 'member' })).toEqual([
        recordId(3),
      ]);
    });

    it('o filtro de módulo casa só ações que COMEÇAM com "<módulo>."', async () => {
      await h.seed([
        aRecord(1, { action: 'finance.income_recorded' }),
        aRecord(2, { action: 'finance.entry_approved' }),
        aRecord(3, { action: 'financial.other' }),
        aRecord(4, { action: 'member.finance.viewed' }),
        aRecord(5, { action: 'finance' }),
      ]);

      expect(await ids({ module: 'finance' })).toEqual([
        recordId(2),
        recordId(1),
      ]);
    });

    it('o texto do módulo é literal: curinga de LIKE não casa com nada', async () => {
      await h.seed([
        aRecord(1, { action: 'finance.income_recorded' }),
        aRecord(2, { action: 'a_b.x' }),
      ]);

      expect(await ids({ module: 'f%' })).toEqual([]);
      expect(await ids({ module: 'f_nance' })).toEqual([]);
      expect(await ids({ module: '%' })).toEqual([]);
      expect(await ids({ module: 'a_b' })).toEqual([recordId(2)]);
    });

    it('o período é inclusivo nas duas pontas', async () => {
      await h.seed([
        aRecord(1, { at: '2026-10-20T10:00:00.000Z' }),
        aRecord(2, { at: '2026-10-20T11:00:00.000Z' }),
        aRecord(3, { at: '2026-10-20T12:00:00.000Z' }),
      ]);

      expect(
        await ids({
          from: at('2026-10-20T11:00:00.000Z'),
          to: at('2026-10-20T12:00:00.000Z'),
        }),
      ).toEqual([recordId(3), recordId(2)]);
      expect(await ids({ to: at('2026-10-20T10:59:59.999Z') })).toEqual([
        recordId(1),
      ]);
    });

    it('respeita o limite', async () => {
      await h.seed([
        aRecord(1, { at: '2026-10-20T10:00:00.000Z' }),
        aRecord(2, { at: '2026-10-20T11:00:00.000Z' }),
        aRecord(3, { at: '2026-10-20T12:00:00.000Z' }),
      ]);

      expect(await ids({ limit: 2 })).toEqual([recordId(3), recordId(2)]);
    });

    it('a paginação por cursor não repete nem pula registro, mesmo com instantes iguais', async () => {
      const same = '2026-10-20T12:00:00.000Z';
      await h.seed([
        aRecord(1, { at: '2026-10-20T09:00:00.000Z' }),
        aRecord(2, { at: same }),
        aRecord(3, { at: same }),
        aRecord(4, { at: same }),
        aRecord(5, { at: '2026-10-20T13:00:00.000Z' }),
      ]);

      const seen: string[] = [];
      let before: AuditSearchCriteria['before'] = null;
      for (let page = 0; page < 10; page++) {
        const items = await h.repository.search(orgId(1), {
          ...everything,
          limit: 2,
          before,
        });
        if (items.length === 0) break;
        seen.push(...items.map((r) => r.id));
        const last = items.at(-1)!;
        before = { occurredAt: last.occurredAt, id: last.id };
      }

      expect(seen).toEqual([
        recordId(5),
        recordId(4),
        recordId(3),
        recordId(2),
        recordId(1),
      ]);
    });

    it('o cursor devolve só os ESTRITAMENTE mais antigos (o próprio registro do cursor não volta)', async () => {
      await h.seed([
        aRecord(1, { at: '2026-10-20T10:00:00.000Z' }),
        aRecord(2, { at: '2026-10-20T11:00:00.000Z' }),
      ]);

      expect(
        await ids({
          before: {
            occurredAt: at('2026-10-20T11:00:00.000Z'),
            id: recordId(2),
          },
        }),
      ).toEqual([recordId(1)]);
    });
  });
}
