import { describe, expect, it } from 'vitest';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import { congId, orgId } from '../domain/testing/fixtures.js';
import {
  FakeMemberAccess,
  aMembersBed,
  everything,
} from './testing/test-bed.js';

const zero = { ACTIVE: 0, AWAY: 0, TRANSFERRED_OUT: 0, DECEASED: 0 };

/** Igreja 1: dois ativos e um afastado na 1, um ativo na 2, um anonimizado na 3. Igreja 2: um ativo na 10. */
async function bedWithMembers() {
  const bed = aMembersBed();
  await bed.seed('Ana', 1);
  await bed.seed('Bruna', 1);
  const away = await bed.seed('Carla', 1);
  await bed.seed('Davi', 2);
  const anonymous = await bed.seed('Eva', 3);
  await bed.seed('Fábio', 10, 2);
  await bed.changeStatus.execute(bed.context, everything(), {
    memberId: away,
    status: 'AWAY',
  });
  await bed.anonymize.execute(bed.context, everything(), {
    memberId: anonymous,
  });
  bed.audit.entries.length = 0;
  return bed;
}

describe('GetMemberStatsUseCase (UC-16, membros)', () => {
  it('a igreja toda: totais por situação e por congregação, sem anonimizados nem outra igreja', async () => {
    const bed = await bedWithMembers();

    const view = await bed.stats.execute(bed.context, everything(), {});

    expect(view).toEqual({
      scope: 'ORGANIZATION',
      totals: { ...zero, ACTIVE: 3, AWAY: 1 },
      byCongregation: [
        { congregationId: congId(1), counts: { ...zero, ACTIVE: 2, AWAY: 1 } },
        { congregationId: congId(2), counts: { ...zero, ACTIVE: 1 } },
      ],
    });
  });

  it('ESCOPO: só as congregações que o usuário lê; quem não lê nenhuma recebe zeros', async () => {
    const bed = await bedWithMembers();

    const some = await bed.stats.execute(
      bed.context,
      new FakeMemberAccess({ read: [congId(2)] }),
      {},
    );
    const none = await bed.stats.execute(
      bed.context,
      new FakeMemberAccess({ read: [] }),
      {},
    );

    expect(some).toEqual({
      scope: 'CONGREGATIONS',
      totals: { ...zero, ACTIVE: 1 },
      byCongregation: [
        { congregationId: congId(2), counts: { ...zero, ACTIVE: 1 } },
      ],
    });
    expect(none).toEqual({
      scope: 'CONGREGATIONS',
      totals: zero,
      byCongregation: [],
    });
  });

  it('o filtro por congregação só ESTREITA o escopo: pedir uma que não lê dá zeros, nunca amplia', async () => {
    const bed = await bedWithMembers();
    const reader2 = new FakeMemberAccess({ read: [congId(2)] });

    const narrowed = await bed.stats.execute(bed.context, everything(), {
      congregationId: congId(1),
    });
    const outside = await bed.stats.execute(bed.context, reader2, {
      congregationId: congId(1),
    });

    expect(narrowed.scope).toBe('CONGREGATIONS');
    expect(narrowed.totals).toEqual({ ...zero, ACTIVE: 2, AWAY: 1 });
    expect(outside.totals).toEqual(zero);
  });

  it('REGISTRA a consulta na trilha, sem dado de ninguém', async () => {
    const bed = await bedWithMembers();

    await bed.stats.execute(bed.context, everything(), {
      congregationId: congId(1),
    });

    expect(bed.audit.entries).toEqual([
      {
        organizationId: orgId(1),
        actorId: bed.context.actorId,
        action: 'member.stats_read',
        entity: 'member',
        entityId: null,
        metadata: { filteredByCongregation: true },
      },
    ]);
  });

  it('FALHA FECHADA: se a trilha não grava, os números NÃO saem', async () => {
    const bed = await bedWithMembers();
    bed.audit.failWith = new Error('trilha fora do ar');

    expect(
      await rejectionOf(() => bed.stats.execute(bed.context, everything(), {})),
    ).toEqual(new Error('trilha fora do ar'));
  });
});
