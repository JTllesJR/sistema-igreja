import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { rejectionOf } from '../../../shared/testing/rejection-of.js';
import {
  CongregationUnavailableError,
  MemberAccessDeniedError,
  MemberAnonymizedError,
  MemberNotFoundError,
} from '../domain/errors.js';
import { congId, orgId } from '../domain/testing/fixtures.js';
import {
  FakeMemberAccess,
  aMembersBed,
  everything,
} from './testing/test-bed.js';

const MARIA = {
  fullName: '  Maria   da Silva ',
  birthDate: '1990-05-10',
  phone: '(81) 99999-8888',
  email: 'Maria@Exemplo.com',
  address: {
    street: 'Rua das Flores',
    number: '100',
    city: 'Recife',
    state: 'PE',
  },
};

describe('RegisterMemberUseCase (UC-06)', () => {
  it('cadastra o membro na igreja DO CONTEXTO, ativo, e já com a história começando', async () => {
    const bed = aMembersBed();

    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(2),
      ...MARIA,
    });

    const member = await bed.repository.findById(orgId(1), id as never);
    expect(member).toMatchObject({
      status: 'ACTIVE',
      congregationId: congId(2),
      organizationId: orgId(1),
    });
    expect(member?.fullName.value).toBe('Maria da Silva');
    expect(member?.phone?.value).toBe('81999998888');
    expect(member?.email?.value).toBe('maria@exemplo.com');
    expect(
      (await bed.repository.listHistory(orgId(1), id as never)).map(
        (e) => e.type,
      ),
    ).toEqual(['REGISTERED']);
  });

  it('registra na trilha QUEM cadastrou e QUAL membro, sem nenhum dado pessoal', async () => {
    const bed = aMembersBed();

    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(1),
      ...MARIA,
    });

    expect(bed.audit.entries).toEqual([
      {
        organizationId: orgId(1),
        actorId: bed.context.actorId,
        action: 'member.registered',
        entity: 'member',
        entityId: id,
        metadata: { congregationId: congId(1) },
      },
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toMatch(
      /Maria|99999|exemplo|Flores/,
    );
  });

  it('aceita informar a situação (migração de quem já está afastado) e recusa uma que não existe', async () => {
    const bed = aMembersBed();

    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(1),
      fullName: 'João Souza',
      status: 'AWAY',
    });
    const invalid = await rejectionOf(() =>
      bed.register.execute(bed.context, everything(), {
        congregationId: congId(1),
        fullName: 'João Souza',
        status: 'EM_DISCIPLINA',
      }),
    );

    expect((await bed.repository.findById(orgId(1), id as never))?.status).toBe(
      'AWAY',
    );
    expect(invalid).toBeInstanceOf(ValidationError);
  });

  it('o cargo é membro por padrão; aceita um dos cargos da igreja e recusa um que não existe', async () => {
    const bed = aMembersBed();
    const register = (position?: string) =>
      bed.register.execute(bed.context, everything(), {
        congregationId: congId(1),
        fullName: 'João Souza',
        ...(position === undefined ? {} : { position }),
      });

    const byDefault = await register();
    const deacon = await register('DEACON');
    const invalid = await rejectionOf(() => register('BISPO'));

    const positionOf = async (id: string) =>
      (await bed.repository.findById(orgId(1), id as never))?.position;
    expect(await positionOf(byDefault.id)).toBe('MEMBER');
    expect(await positionOf(deacon.id)).toBe('DEACON');
    expect(invalid).toBeInstanceOf(ValidationError);
  });

  it('só quem pode ESCREVER na congregação cadastra: leitura não basta, nem escrever em outra', async () => {
    const bed = aMembersBed();
    const readOnly = new FakeMemberAccess({ read: 'ALL' });
    const writesElsewhere = new FakeMemberAccess({
      read: 'ALL',
      write: [congId(2)],
    });

    for (const access of [readOnly, writesElsewhere]) {
      const error = await rejectionOf(() =>
        bed.register.execute(bed.context, access, {
          congregationId: congId(1),
          fullName: 'Maria',
        }),
      );
      expect(error).toBeInstanceOf(MemberAccessDeniedError);
    }
    expect(
      (
        await bed.repository.search(orgId(1), {
          congregationIds: null,
          term: null,
          status: null,
          limit: 10,
          offset: 0,
        })
      ).total,
    ).toBe(0);
    expect(bed.audit.entries).toEqual([]);
  });

  it('sem permissão, nem consulta a congregação: não revela se ela existe', async () => {
    const bed = aMembersBed();

    await rejectionOf(() =>
      bed.register.execute(bed.context, new FakeMemberAccess({ read: 'ALL' }), {
        congregationId: congId(999),
        fullName: 'Maria',
      }),
    );

    expect(bed.congregations.lookups).toBe(0);
  });

  it.each([
    ['desativada', congId(4)],
    ['inexistente', congId(999)],
  ])('congregação %s não recebe membros', async (_nome, congregationId) => {
    const bed = aMembersBed();

    const error = await rejectionOf(() =>
      bed.register.execute(bed.context, everything(), {
        congregationId,
        fullName: 'Maria',
      }),
    );

    expect(error).toBeInstanceOf(CongregationUnavailableError);
    expect(bed.audit.entries).toEqual([]);
  });

  it('congregação de OUTRA igreja é tratada como inexistente', async () => {
    const bed = aMembersBed();

    const error = await rejectionOf(() =>
      bed.register.execute(bed.context, everything(), {
        congregationId: congId(10),
        fullName: 'Maria',
      }),
    );

    expect(error).toBeInstanceOf(CongregationUnavailableError);
  });

  it.each([
    ['nome curto demais', { fullName: 'A' }],
    ['nascimento no futuro', { fullName: 'Maria', birthDate: '2030-01-01' }],
    ['data impossível', { fullName: 'Maria', birthDate: '2026-02-30' }],
    ['telefone inválido', { fullName: 'Maria', phone: '123' }],
    ['e-mail inválido', { fullName: 'Maria', email: 'sem-arroba' }],
    [
      'UF inexistente',
      {
        fullName: 'Maria',
        address: { street: 'Rua A', city: 'X', state: 'ZZ' },
      },
    ],
  ])(
    'dado inválido (%s) é recusado, sem gravar nada nem auditar',
    async (_nome, extra) => {
      const bed = aMembersBed();

      const error = await rejectionOf(() =>
        bed.register.execute(bed.context, everything(), {
          congregationId: congId(1),
          ...extra,
        }),
      );

      expect(error).toBeInstanceOf(ValidationError);
      expect(
        (
          await bed.repository.search(orgId(1), {
            congregationIds: null,
            term: null,
            status: null,
            limit: 10,
            offset: 0,
          })
        ).total,
      ).toBe(0);
      expect(bed.audit.entries).toEqual([]);
    },
  );

  it('campos opcionais em branco viram ausentes', async () => {
    const bed = aMembersBed();

    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(1),
      fullName: 'Maria',
      birthDate: '',
      phone: '  ',
      email: null,
    });

    expect(await bed.repository.findById(orgId(1), id as never)).toMatchObject({
      birthDate: null,
      phone: null,
      email: null,
    });
  });
});

describe('UpdateMemberUseCase (UC-06)', () => {
  it('altera só o que foi informado e audita os NOMES dos campos, nunca os valores', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva');

    await bed.update.execute(bed.context, everything(), {
      memberId: id,
      fullName: 'Maria Souza',
      phone: '81 3333-4444',
    });

    const member = await bed.repository.findById(orgId(1), id as never);
    expect(member?.fullName.value).toBe('Maria Souza');
    expect(member?.phone?.value).toBe('8133334444');
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'member.updated',
        entityId: id,
        metadata: { fields: 'fullName,phone' },
      }),
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toMatch(/Souza|3333/);
  });

  it('muda o cargo e audita só o NOME do campo; cargo inexistente é recusado e nada muda', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva');

    await bed.update.execute(bed.context, everything(), {
      memberId: id,
      position: 'DEACONESS',
    });
    const invalid = await rejectionOf(() =>
      bed.update.execute(bed.context, everything(), {
        memberId: id,
        position: 'BISPO',
      }),
    );

    expect(
      (await bed.repository.findById(orgId(1), id as never))?.position,
    ).toBe('DEACONESS');
    expect(invalid).toBeInstanceOf(ValidationError);
    expect(bed.audit.entries).toEqual([
      expect.objectContaining({
        action: 'member.updated',
        metadata: { fields: 'position' },
      }),
    ]);
    expect(JSON.stringify(bed.audit.entries)).not.toContain('DEACONESS');
  });

  it('apaga um campo opcional com null ou texto em branco', async () => {
    const bed = aMembersBed();
    const { id } = await bed.register.execute(bed.context, everything(), {
      congregationId: congId(1),
      ...MARIA,
    });

    await bed.update.execute(bed.context, everything(), {
      memberId: id,
      phone: null,
      email: ' ',
      address: null,
    });

    expect(await bed.repository.findById(orgId(1), id as never)).toMatchObject({
      phone: null,
      email: null,
      address: null,
    });
  });

  it('se nada mudou de verdade, não grava nem audita', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva');

    await bed.update.execute(bed.context, everything(), {
      memberId: id,
      fullName: 'Maria da Silva',
    });

    expect(bed.audit.entries).toEqual([]);
    expect(
      (await bed.repository.findById(orgId(1), id as never))?.version,
    ).toBe(0);
  });

  it('quem só LÊ a congregação vê o membro mas não o altera (403, não 404)', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva', 1);

    const error = await rejectionOf(() =>
      bed.update.execute(bed.context, new FakeMemberAccess({ read: 'ALL' }), {
        memberId: id,
        fullName: 'Hackeada',
      }),
    );

    expect(error).toBeInstanceOf(MemberAccessDeniedError);
    expect(
      (await bed.repository.findById(orgId(1), id as never))?.fullName.value,
    ).toBe('Maria da Silva');
  });

  it('quem não pode nem LER a congregação recebe "não encontrado", como se o membro não existisse', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva', 1);
    const otherCongregation = new FakeMemberAccess({
      read: [congId(2)],
      write: [congId(2)],
    });

    const error = await rejectionOf(() =>
      bed.update.execute(bed.context, otherCongregation, {
        memberId: id,
        fullName: 'Hackeada',
      }),
    );

    expect(error).toBeInstanceOf(MemberNotFoundError);
  });

  it('membro de OUTRA igreja: "não encontrado", mesmo com acesso total na sua', async () => {
    const bed = aMembersBed();
    const foreign = await bed.seed('Maria de Outra Igreja', 10, 2);

    const error = await rejectionOf(() =>
      bed.update.execute(bed.context, everything(), {
        memberId: foreign,
        fullName: 'Invasão',
      }),
    );

    expect(error).toBeInstanceOf(MemberNotFoundError);
    expect(
      (await bed.repository.findById(orgId(2), foreign as never))?.fullName
        .value,
    ).toBe('Maria de Outra Igreja');
  });

  it('membro anonimizado não aceita alteração', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva');
    await bed.anonymize.execute(bed.context, everything(), { memberId: id });

    const error = await rejectionOf(() =>
      bed.update.execute(bed.context, everything(), {
        memberId: id,
        fullName: 'Ressuscitada',
      }),
    );

    expect(error).toBeInstanceOf(MemberAnonymizedError);
  });

  it('dado inválido é recusado e nada muda', async () => {
    const bed = aMembersBed();
    const id = await bed.seed('Maria da Silva');

    const error = await rejectionOf(() =>
      bed.update.execute(bed.context, everything(), {
        memberId: id,
        fullName: 'Nova',
        phone: 'abc',
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(
      (await bed.repository.findById(orgId(1), id as never))?.fullName.value,
    ).toBe('Maria da Silva');
  });
});
