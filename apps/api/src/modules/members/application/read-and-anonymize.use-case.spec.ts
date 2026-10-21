import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import {
  MemberAccessDeniedError,
  MemberAnonymizedError,
  MemberNotFoundError,
} from '../domain/errors.js';
import { MemberId } from '../domain/ids.js';
import { congId, orgId } from '../domain/testing/fixtures.js';
import {
  FakeMemberAccess,
  aMembersBed,
  everything,
} from './testing/test-bed.js';

const FULL = {
  fullName: 'Maria da Silva',
  birthDate: '1990-05-10',
  phone: '(81) 99999-8888',
  email: 'maria@exemplo.com',
  address: { street: 'Rua das Flores', city: 'Recife', state: 'PE' },
};

describe('GetMemberUseCase (leitura de dado sensível)', () => {
  it('devolve a ficha completa com a história e o que o usuário pode fazer nela', async () => {
    const bed = aMembersBed();
    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(1),
      ...FULL,
    });

    const view = await bed.get.execute(bed.context, everything(), {
      memberId: id,
    });

    expect(view).toMatchObject({
      id,
      fullName: 'Maria da Silva',
      congregationId: congId(1),
      status: 'ACTIVE',
      birthDate: '1990-05-10',
      phone: '81999998888',
      email: 'maria@exemplo.com',
      address: { street: 'Rua das Flores', city: 'Recife', state: 'PE' },
      anonymized: false,
      capabilities: { canEdit: true, canAnonymize: true },
    });
    expect(view.history.map((e) => e.type)).toEqual(['REGISTERED']);
  });

  it('as capacidades refletem o acesso de QUEM pergunta (leitor não edita nem anonimiza)', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);

    const view = await bed.get.execute(
      bed.context,
      new FakeMemberAccess({ read: [congId(1)] }),
      { memberId: id },
    );

    expect(view.capabilities).toEqual({ canEdit: false, canAnonymize: false });
  });

  it('REGISTRA a leitura na trilha: quem viu qual membro', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');

    await bed.get.execute(bed.context, everything(), { memberId: id });

    expect(bed.audit.entries).toEqual([
      {
        organizationId: orgId(1),
        actorId: bed.context.actorId,
        action: 'member.viewed',
        entity: 'member',
        entityId: id,
      },
    ]);
  });

  it('FALHA FECHADA: se a trilha não grava, a ficha NÃO sai', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');
    bed.audit.failWith = new Error('banco da trilha fora do ar');

    const error = await rejectionOf(() =>
      bed.get.execute(bed.context, everything(), { memberId: id }),
    );

    expect(error).toEqual(new Error('banco da trilha fora do ar'));
  });

  it('quem não pode ver (outra congregação, outra igreja, inexistente): 404 IGUAL, e nada é auditado', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria', 1);
    const foreign = await bed.seed('Maria de Outra Igreja', 10, 2);
    const otherCongregation = new FakeMemberAccess({ read: [congId(2)] });

    const errors = [
      await rejectionOf(() =>
        bed.get.execute(bed.context, otherCongregation, { memberId: id }),
      ),
      await rejectionOf(() =>
        bed.get.execute(bed.context, everything(), { memberId: foreign }),
      ),
      await rejectionOf(() =>
        bed.get.execute(bed.context, everything(), {
          memberId: MemberId.of('0199c0a4-7b3e-7c11-8f2a-00000000abcd'),
        }),
      ),
    ];

    for (const error of errors)
      expect(error).toBeInstanceOf(MemberNotFoundError);
    expect(new Set(errors.map((e) => (e as Error).message)).size).toBe(1);
    expect(bed.audit.entries).toEqual([]);
  });
});

describe('ListMembersUseCase (UC-09)', () => {
  async function bedWithMembers() {
    const bed = aMembersBed();
    await bed.seed('Ana Souza', 1);
    await bed.seed('Álvaro Lima', 1);
    await bed.seed('José Conceição', 2);
    await bed.seed('Bruna Alves', 3);
    await bed.seed('Ana de Outra Igreja', 10, 2);
    return bed;
  }
  const names = (view: { items: { fullName: string }[] }) =>
    view.items.map((i) => i.fullName);

  it('lista a igreja toda para quem a enxerga toda, sem nunca mostrar outra igreja', async () => {
    const bed = await bedWithMembers();

    const view = await bed.list.execute(bed.context, everything(), {});

    expect(names(view)).toEqual([
      'Álvaro Lima',
      'Ana Souza',
      'Bruna Alves',
      'José Conceição',
    ]);
    expect(view).toMatchObject({ total: 4, limit: 20, offset: 0 });
  });

  it('ESCOPO: só as congregações que o usuário lê; quem não lê nenhuma recebe lista vazia', async () => {
    const bed = await bedWithMembers();

    const some = await bed.list.execute(
      bed.context,
      new FakeMemberAccess({ read: [congId(1), congId(3)] }),
      {},
    );
    const none = await bed.list.execute(
      bed.context,
      new FakeMemberAccess({ read: [] }),
      {},
    );

    expect(names(some)).toEqual(['Álvaro Lima', 'Ana Souza', 'Bruna Alves']);
    expect(none).toMatchObject({ items: [], total: 0 });
  });

  it('o filtro por congregação só ESTREITA o escopo: pedir uma que não lê dá vazio, nunca amplia', async () => {
    const bed = await bedWithMembers();
    const access = new FakeMemberAccess({ read: [congId(1)] });

    const allowed = await bed.list.execute(bed.context, access, {
      congregationId: congId(1),
    });
    const forbidden = await bed.list.execute(bed.context, access, {
      congregationId: congId(2),
    });
    const narrowed = await bed.list.execute(bed.context, everything(), {
      congregationId: congId(2),
    });

    expect(names(allowed)).toEqual(['Álvaro Lima', 'Ana Souza']);
    expect(forbidden.items).toEqual([]);
    expect(names(narrowed)).toEqual(['José Conceição']);
  });

  it('busca por trecho do nome sem diferenciar acento nem caixa, e filtra por situação', async () => {
    const bed = await bedWithMembers();
    const [ana] = (
      await bed.list.execute(bed.context, everything(), { search: 'ANA' })
    ).items;
    await bed.changeStatus.execute(bed.context, everything(), {
      memberId: ana!.id,
      status: 'AWAY',
    });

    expect(
      names(
        await bed.list.execute(bed.context, everything(), {
          search: '  alvaro ',
        }),
      ),
    ).toEqual(['Álvaro Lima']);
    expect(
      names(
        await bed.list.execute(bed.context, everything(), { status: 'AWAY' }),
      ),
    ).toEqual([ana!.fullName]);
  });

  it('pagina e informa o total', async () => {
    const bed = await bedWithMembers();

    const page = await bed.list.execute(bed.context, everything(), {
      limit: 2,
      offset: 2,
    });

    expect(names(page)).toEqual(['Bruna Alves', 'José Conceição']);
    expect(page).toMatchObject({ total: 4, limit: 2, offset: 2 });
  });

  it.each([
    ['limite zero', { limit: 0 }],
    ['limite acima do máximo', { limit: 101 }],
    ['limite fracionário', { limit: 1.5 }],
    ['posição negativa', { offset: -1 }],
    ['posição absurda', { offset: 1_000_000 }],
    ['busca enorme', { search: 'a'.repeat(101) }],
    ['situação inexistente', { status: 'EM_DISCIPLINA' }],
  ])('recusa %s', async (_nome, query) => {
    const bed = await bedWithMembers();

    const error = await rejectionOf(() =>
      bed.list.execute(bed.context, everything(), query),
    );

    expect(error).toBeInstanceOf(ValidationError);
  });

  it('REGISTRA a consulta na trilha, SEM o termo buscado (pode ser o nome de alguém)', async () => {
    const bed = await bedWithMembers();

    await bed.list.execute(bed.context, everything(), {
      search: 'José Conceição',
      status: 'ACTIVE',
    });

    expect(bed.audit.entries).toEqual([
      {
        organizationId: orgId(1),
        actorId: bed.context.actorId,
        action: 'member.listed',
        entity: 'member',
        entityId: null,
        metadata: {
          returned: 1,
          total: 1,
          searched: true,
          filteredByStatus: true,
          filteredByCongregation: false,
        },
      },
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toMatch(/José|Conceição/);
  });

  it('FALHA FECHADA: se a trilha não grava, a lista NÃO sai', async () => {
    const bed = await bedWithMembers();
    bed.audit.failWith = new Error('trilha fora do ar');

    expect(
      await rejectionOf(() => bed.list.execute(bed.context, everything(), {})),
    ).toEqual(new Error('trilha fora do ar'));
  });
});

describe('AnonymizeMemberUseCase (LGPD, ADR 0006)', () => {
  it('apaga os dados pessoais, mantém congregação e situação, e registra o evento', async () => {
    const bed = aMembersBed();
    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(2),
      ...FULL,
    });
    await bed.recordEvent.execute(bed.context, everything(), {
      memberId: id,
      type: 'BAPTISM',
      occurredOn: '2010-03-14',
      notes: 'Observação com dado pessoal',
    });

    await bed.anonymize.execute(bed.context, everything(), { memberId: id });

    const view = await bed.get.execute(bed.context, everything(), {
      memberId: id,
    });
    expect(view).toMatchObject({
      fullName: 'Membro anonimizado',
      birthDate: null,
      phone: null,
      email: null,
      address: null,
      anonymized: true,
      congregationId: congId(2),
      status: 'ACTIVE',
      capabilities: { canEdit: false, canAnonymize: false },
    });
    expect(view.history.map((e) => e.type)).toEqual([
      'ANONYMIZED',
      'BAPTISM',
      'REGISTERED',
    ]);
    expect(view.history.every((e) => e.notes === null)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(
      /Maria|99999|exemplo|Flores|Observação/,
    );
  });

  it('sai da lista e da busca', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva');
    await bed.seed('João Souza');

    await bed.anonymize.execute(bed.context, everything(), { memberId: id });

    const view = await bed.list.execute(bed.context, everything(), {});
    expect(view.items.map((i) => i.fullName)).toEqual(['João Souza']);
    expect(
      (await bed.list.execute(bed.context, everything(), { search: 'maria' }))
        .items,
    ).toEqual([]);
  });

  it('audita QUEM apagou e QUANDO, e nada do que foi apagado', async () => {
    const bed = aMembersBed();
    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(1),
      ...FULL,
    });
    bed.audit.entries.length = 0;

    await bed.anonymize.execute(bed.context, everything(), { memberId: id });

    expect(bed.audit.entries).toEqual([
      {
        organizationId: orgId(1),
        actorId: bed.context.actorId,
        action: 'member.anonymized',
        entity: 'member',
        entityId: id,
      },
    ]);
  });

  it('exige a permissão para a IGREJA TODA: escrever na congregação não basta', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');
    const congregationLeader = new FakeMemberAccess({
      read: 'ALL',
      write: 'ALL',
      anonymize: false,
    });

    const error = await rejectionOf(() =>
      bed.anonymize.execute(bed.context, congregationLeader, { memberId: id }),
    );

    expect(error).toBeInstanceOf(MemberAccessDeniedError);
    expect(
      (await bed.get.execute(bed.context, everything(), { memberId: id }))
        .fullName,
    ).toBe('Maria');
  });

  it('é irreversível: anonimizar de novo é recusado', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria');
    await bed.anonymize.execute(bed.context, everything(), { memberId: id });

    const error = await rejectionOf(() =>
      bed.anonymize.execute(bed.context, everything(), { memberId: id }),
    );

    expect(error).toBeInstanceOf(MemberAnonymizedError);
  });

  it('membro de OUTRA igreja: "não encontrado"', async () => {
    const bed = aMembersBed();
    const foreign = await bed.seed('Maria de Outra Igreja', 10, 2);

    const error = await rejectionOf(() =>
      bed.anonymize.execute(bed.context, everything(), { memberId: foreign }),
    );

    expect(error).toBeInstanceOf(MemberNotFoundError);
  });
});
