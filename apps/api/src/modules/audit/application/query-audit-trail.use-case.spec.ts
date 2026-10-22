import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { InMemoryAuditLog } from '../../../shared/testing/in-memory-audit-log.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import {
  actor,
  aRecord,
  entityOf,
  orgId,
  recordId,
} from '../domain/testing/audit-query.contract.js';
import { InMemoryAuditQueryRepository } from '../domain/testing/in-memory-audit-query.repository.js';
import { AuditAccessDeniedError } from '../domain/errors.js';
import type { AuditAccess } from './audit-access.js';
import { QueryAuditTrailUseCase } from './query-audit-trail.use-case.js';

const allowed: AuditAccess = { canRead: () => true };
const denied: AuditAccess = { canRead: () => false };

function aBed() {
  const repository = new InMemoryAuditQueryRepository();
  const audit = new InMemoryAuditLog();
  const useCase = new QueryAuditTrailUseCase(repository, audit);
  const context = { organizationId: orgId(1), actorId: actor(9) };
  return { repository, audit, useCase, context };
}

const hour = (h: number) =>
  `2026-10-20T${String(h).padStart(2, '0')}:00:00.000Z`;

describe('QueryAuditTrailUseCase (UC-04)', () => {
  it('só quem pode ler a trilha da igreja toda consulta (mesmo se a rota esquecesse de barrar)', async () => {
    const { useCase, context, audit } = aBed();

    expect(
      await rejectionOf(() => useCase.execute(context, denied, {})),
    ).toBeInstanceOf(AuditAccessDeniedError);
    expect(audit.entries).toEqual([]);
  });

  it('devolve a trilha da PRÓPRIA igreja, do mais recente ao mais antigo, no formato da visão', async () => {
    const { repository, useCase, context } = aBed();
    repository.seed(
      aRecord(1, { at: hour(10), metadata: { count: 3 } }),
      aRecord(2, { at: hour(11) }),
      aRecord(3, { at: hour(12), organizationId: orgId(2) }),
    );

    const page = await useCase.execute(context, allowed, {});

    expect(page.nextCursor).toBeNull();
    expect(page.items.map((i) => i.id)).toEqual([recordId(2), recordId(1)]);
    expect(page.items[1]).toEqual({
      id: recordId(1),
      actorId: actor(1),
      action: 'member.viewed',
      entity: 'member',
      entityId: entityOf(1),
      metadata: { count: 3 },
      occurredAt: hour(10),
    });
  });

  it('aplica os filtros (quem fez, dado, ação, módulo e período)', async () => {
    const { repository, useCase, context } = aBed();
    repository.seed(
      aRecord(1, { at: hour(10), actorId: actor(1) }),
      aRecord(2, {
        at: hour(11),
        actorId: actor(2),
        action: 'finance.entry_approved',
        entity: 'financial_entry',
        entityId: entityOf(2),
      }),
      aRecord(3, {
        at: hour(12),
        actorId: actor(2),
        action: 'finance.income_recorded',
        entity: 'financial_entry',
        entityId: entityOf(3),
      }),
    );
    const ids = async (query: object) =>
      (await useCase.execute(context, allowed, query)).items.map((i) => i.id);

    expect(await ids({ actorId: actor(2) })).toEqual([
      recordId(3),
      recordId(2),
    ]);
    expect(await ids({ entityId: entityOf(2) })).toEqual([recordId(2)]);
    expect(
      await ids({
        entity: 'financial_entry',
        action: 'finance.income_recorded',
      }),
    ).toEqual([recordId(3)]);
    expect(await ids({ module: 'finance' })).toEqual([
      recordId(3),
      recordId(2),
    ]);
    expect(await ids({ from: hour(11), to: hour(11) })).toEqual([recordId(2)]);
  });

  it('pagina por cursor: pede um a mais, devolve o próximo cursor só se houver mais, e percorre tudo sem repetir', async () => {
    const { repository, useCase, context } = aBed();
    for (let n = 1; n <= 5; n++)
      repository.seed(aRecord(n, { at: hour(10 + n) }));

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await useCase.execute(context, allowed, {
        limit: 2,
        ...(cursor ? { cursor } : {}),
      });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual([5, 4, 3, 2, 1].map(recordId));
  });

  it('a última página cheia (exatamente o limite) não inventa uma página vazia', async () => {
    const { repository, useCase, context } = aBed();
    repository.seed(aRecord(1, { at: hour(10) }), aRecord(2, { at: hour(11) }));

    const page = await useCase.execute(context, allowed, { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('a PRÓPRIA consulta é registrada ANTES de devolver, só com os NOMES dos filtros, nunca os valores', async () => {
    const { repository, audit, useCase, context } = aBed();
    repository.seed(aRecord(1, { at: hour(10), entityId: entityOf(7) }));

    await useCase.execute(context, allowed, {
      entityId: entityOf(7),
      module: 'member',
    });

    expect(audit.entries).toEqual([
      expect.objectContaining({
        action: 'audit.queried',
        entity: 'audit_log',
        entityId: null,
        actorId: actor(9),
        metadata: { returned: 1, filters: 'entityId,module', paged: false },
      }),
    ]);
    expect(JSON.stringify(audit.entries)).not.toContain(entityOf(7));
  });

  it('FALHA FECHADA: se a trilha não grava a consulta, nada é devolvido', async () => {
    const { repository, audit, useCase, context } = aBed();
    repository.seed(aRecord(1));
    audit.failWith = new Error('trilha fora do ar');

    await expect(useCase.execute(context, allowed, {})).rejects.toThrow(
      'trilha fora do ar',
    );
  });

  it('marca a consulta paginada na trilha', async () => {
    const { repository, audit, useCase, context } = aBed();
    for (let n = 1; n <= 3; n++)
      repository.seed(aRecord(n, { at: hour(10 + n) }));
    const first = await useCase.execute(context, allowed, { limit: 1 });

    await useCase.execute(context, allowed, {
      limit: 1,
      cursor: first.nextCursor!,
    });

    expect(audit.entries.at(-1)?.metadata).toMatchObject({
      paged: true,
      filters: '',
    });
  });

  it.each([
    ['limite zero', { limit: 0 }],
    ['limite acima do máximo', { limit: 101 }],
    ['limite decimal', { limit: 1.5 }],
    ['ator que não é UUID', { actorId: 'maria' }],
    ['dado que não é UUID', { entityId: '123' }],
    ['módulo com curinga', { module: 'fin%' }],
    ['módulo com maiúscula', { module: 'Finance' }],
    ['módulo com ponto', { module: 'finance.entry' }],
    ['instante inválido', { from: 'ontem' }],
    ['início depois do fim', { from: hour(12), to: hour(10) }],
    ['cursor que não é cursor', { cursor: 'lixo' }],
    [
      'cursor com JSON de outro formato',
      { cursor: Buffer.from('{"t":1,"i":2}').toString('base64url') },
    ],
    [
      'cursor com id que não é UUID',
      {
        cursor: Buffer.from(JSON.stringify({ t: hour(10), i: 'x' })).toString(
          'base64url',
        ),
      },
    ],
  ])('recusa %s', async (_nome, query) => {
    const { useCase, context, audit } = aBed();

    expect(
      await rejectionOf(() => useCase.execute(context, allowed, query)),
    ).toBeInstanceOf(ValidationError);
    expect(audit.entries).toEqual([]);
  });
});
