import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import {
  CongregationUnavailableError,
  MemberAccessDeniedError,
  MemberAlreadyInCongregationError,
  MemberAlreadyInStatusError,
  MemberNotFoundError,
} from '../domain/errors.js';
import { MemberId } from '../domain/ids.js';
import { congId, orgId } from '../domain/testing/fixtures.js';
import {
  FakeMemberAccess,
  aMembersBed,
  everything,
} from './testing/test-bed.js';

const load = (bed: ReturnType<typeof aMembersBed>, id: string) =>
  bed.repository.findById(orgId(1), MemberId.of(id));
const historyOf = (bed: ReturnType<typeof aMembersBed>, id: string) =>
  bed.repository.listHistory(orgId(1), MemberId.of(id));

describe('ChangeMemberStatusUseCase', () => {
  it('muda a situação, registra de onde para onde na história e na trilha', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');

    await bed.changeStatus.execute(bed.context, everything(), {
      memberId: id,
      status: 'AWAY',
    });

    expect((await load(bed, id))?.status).toBe('AWAY');
    expect((await historyOf(bed, id))[0]).toMatchObject({
      type: 'STATUS_CHANGE',
      fromStatus: 'ACTIVE',
      toStatus: 'AWAY',
    });
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'member.status_changed',
        entityId: id,
        metadata: { from: 'ACTIVE', to: 'AWAY' },
      }),
    ]);
  });

  it('repetir a situação atual é recusado; situação inexistente também', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');

    expect(
      await rejectionOf(() =>
        bed.changeStatus.execute(bed.context, everything(), {
          memberId: id,
          status: 'ACTIVE',
        }),
      ),
    ).toBeInstanceOf(MemberAlreadyInStatusError);
    expect(
      await rejectionOf(() =>
        bed.changeStatus.execute(bed.context, everything(), {
          memberId: id,
          status: 'EM_DISCIPLINA',
        }),
      ),
    ).toBeInstanceOf(ValidationError);
    expect(bed.audit.entries).toEqual([]);
  });

  it('exige escrita na congregação: leitor leva 403; quem não vê leva 404', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);

    const reader = await rejectionOf(() =>
      bed.changeStatus.execute(
        bed.context,
        new FakeMemberAccess({ read: 'ALL' }),
        { memberId: id, status: 'AWAY' },
      ),
    );
    const blind = await rejectionOf(() =>
      bed.changeStatus.execute(
        bed.context,
        new FakeMemberAccess({ read: [congId(2)], write: [congId(2)] }),
        { memberId: id, status: 'AWAY' },
      ),
    );

    expect(reader).toBeInstanceOf(MemberAccessDeniedError);
    expect(blind).toBeInstanceOf(MemberNotFoundError);
    expect((await load(bed, id))?.status).toBe('ACTIVE');
  });
});

describe('TransferMemberUseCase (UC-10)', () => {
  it('transfere para outra congregação da igreja e deixa o rastro de origem e destino', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);

    await bed.transfer.execute(bed.context, everything(), {
      memberId: id,
      congregationId: congId(2),
    });

    expect((await load(bed, id))?.congregationId).toBe(congId(2));
    expect((await historyOf(bed, id))[0]).toMatchObject({
      type: 'TRANSFER',
      fromCongregationId: congId(1),
      toCongregationId: congId(2),
    });
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'member.transferred',
        metadata: { from: congId(1), to: congId(2) },
      }),
    ]);
  });

  it('exige escrever na ORIGEM e no DESTINO', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);
    const onlyOrigin = new FakeMemberAccess({
      read: 'ALL',
      write: [congId(1)],
    });
    const onlyDestination = new FakeMemberAccess({
      read: 'ALL',
      write: [congId(2)],
    });

    for (const access of [onlyOrigin, onlyDestination]) {
      const error = await rejectionOf(() =>
        bed.transfer.execute(bed.context, access, {
          memberId: id,
          congregationId: congId(2),
        }),
      );
      expect(error).toBeInstanceOf(MemberAccessDeniedError);
    }
    expect((await load(bed, id))?.congregationId).toBe(congId(1));

    await bed.transfer.execute(
      bed.context,
      new FakeMemberAccess({ read: 'ALL', write: [congId(1), congId(2)] }),
      {
        memberId: id,
        congregationId: congId(2),
      },
    );
    expect((await load(bed, id))?.congregationId).toBe(congId(2));
  });

  it.each([
    ['desativada', congId(4)],
    ['inexistente', congId(999)],
    ['de OUTRA igreja', congId(10)],
  ])('destino %s é recusado', async (_nome, destination) => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);

    const error = await rejectionOf(() =>
      bed.transfer.execute(bed.context, everything(), {
        memberId: id,
        congregationId: destination,
      }),
    );

    expect(error).toBeInstanceOf(CongregationUnavailableError);
    expect((await load(bed, id))?.congregationId).toBe(congId(1));
  });

  it('transferir para onde já está é recusado', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);

    expect(
      await rejectionOf(() =>
        bed.transfer.execute(bed.context, everything(), {
          memberId: id,
          congregationId: congId(1),
        }),
      ),
    ).toBeInstanceOf(MemberAlreadyInCongregationError);
  });

  it('depois de transferido, quem só enxerga a congregação de ORIGEM deixa de ver o membro', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);
    const originLeader = new FakeMemberAccess({ read: [congId(1)] });
    await bed.get.execute(bed.context, originLeader, { memberId: id });

    await bed.transfer.execute(bed.context, everything(), {
      memberId: id,
      congregationId: congId(2),
    });

    expect(
      await rejectionOf(() =>
        bed.get.execute(bed.context, originLeader, { memberId: id }),
      ),
    ).toBeInstanceOf(MemberNotFoundError);
  });
});

describe('RecordMemberEventUseCase (UC-07)', () => {
  it('registra o batismo com a data em que ocorreu, e audita só o tipo', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');

    await bed.recordEvent.execute(bed.context, everything(), {
      memberId: id,
      type: 'BAPTISM',
      occurredOn: '2010-03-14',
      notes: 'Batizada em Recife',
    });

    expect((await historyOf(bed, id))[0]).toMatchObject({
      type: 'BAPTISM',
      occurredOn: { value: '2010-03-14' },
      notes: 'Batizada em Recife',
    });
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'member.event_recorded',
        metadata: { type: 'BAPTISM' },
      }),
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toContain('Recife');
  });

  it.each([
    [
      'tipo que o sistema gera sozinho',
      { type: 'TRANSFER', occurredOn: '2010-03-14' },
    ],
    ['tipo inexistente', { type: 'EXCLUSAO', occurredOn: '2010-03-14' }],
    ['data no futuro', { type: 'BAPTISM', occurredOn: '2030-01-01' }],
    ['data inválida', { type: 'BAPTISM', occurredOn: '14/03/2010' }],
  ])('recusa %s', async (_nome, command) => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');

    const error = await rejectionOf(() =>
      bed.recordEvent.execute(bed.context, everything(), {
        memberId: id,
        ...command,
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(await historyOf(bed, id)).toHaveLength(1);
  });

  it('exige escrita na congregação', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');

    const error = await rejectionOf(() =>
      bed.recordEvent.execute(
        bed.context,
        new FakeMemberAccess({ read: 'ALL' }),
        {
          memberId: id,
          type: 'BAPTISM',
          occurredOn: '2010-03-14',
        },
      ),
    );

    expect(error).toBeInstanceOf(MemberAccessDeniedError);
  });
});
