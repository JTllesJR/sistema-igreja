import { beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import { thrownBy } from '../../../../shared/testing/thrown-by.js';
import { PersonName } from '../person-name.js';
import { Phone } from '../phone.js';
import { MemberNotFoundError } from '../errors.js';
import type { Member } from '../member.js';
import type { MemberRepository } from '../member.repository.js';
import {
  NOW,
  aMember,
  after,
  congId,
  date,
  eventId,
  memberId,
  orgId,
} from './fixtures.js';

function snapshot(member: Member) {
  return {
    id: member.id,
    organizationId: member.organizationId,
    congregationId: member.congregationId,
    fullName: member.fullName.value,
    birthDate: member.birthDate?.value ?? null,
    phone: member.phone?.value ?? null,
    email: member.email?.value ?? null,
    address: member.address?.toPrimitives() ?? null,
    status: member.status,
    position: member.position,
    anonymizedAt: member.anonymizedAt?.toISOString() ?? null,
    version: member.version,
  };
}

/**
 * Bateria de testes que QUALQUER implementação de `MemberRepository` precisa passar. Roda contra o fake em memória
 * (testes unitários) e contra o PostgreSQL (integração): assim o fake dos testes dos casos de uso se comporta como o banco.
 *
 * `makeRepository` entrega um repositório vazio, já com o que o banco exige: as igrejas 1 e 2, as congregações 1 a 3 da
 * igreja 1 e a congregação 10 da igreja 2 (os ids das `fixtures`).
 */
export function describeMemberRepositoryContract(
  name: string,
  makeRepository: () => Promise<MemberRepository>,
): void {
  describe(`MemberRepository (${name})`, () => {
    let repository: MemberRepository;

    beforeEach(async () => {
      repository = await makeRepository();
    });

    const org = orgId(1);

    describe('add e findById', () => {
      it('grava e devolve todos os dados do membro', async () => {
        const member = aMember(1, { full: true, congregation: 2 });
        await repository.add(member);

        const found = await repository.findById(org, memberId(1));

        expect(found && snapshot(found)).toEqual(snapshot(member));
        expect(found?.pendingEvents).toEqual([]);
      });

      it('dados opcionais ausentes voltam ausentes', async () => {
        await repository.add(aMember(1));

        const found = await repository.findById(org, memberId(1));

        expect(found).toMatchObject({
          birthDate: null,
          phone: null,
          email: null,
          address: null,
        });
      });

      it('a data de nascimento não escorrega um dia (é um dia, não um instante)', async () => {
        await repository.add(aMember(1, { full: true }));

        expect(
          (await repository.findById(org, memberId(1)))?.birthDate?.value,
        ).toBe('1990-05-10');
      });

      it('o cargo é gravado e alterado (padrão: MEMBER)', async () => {
        await repository.add(aMember(1));
        const stored = (await repository.findById(org, memberId(1)))!;
        expect(stored.position).toBe('MEMBER');

        stored.updateProfile({ position: 'EVANGELIST' }, NOW);
        await repository.save(stored);

        expect((await repository.findById(org, memberId(1)))?.position).toBe(
          'EVANGELIST',
        );
      });

      it('devolve null para membro inexistente', async () => {
        expect(await repository.findById(org, memberId(404))).toBeNull();
      });

      it('NÃO acha o membro de OUTRA igreja (isolamento entre igrejas)', async () => {
        await repository.add(aMember(1));

        expect(await repository.findById(orgId(2), memberId(1))).toBeNull();
      });

      it('devolve cópias independentes: alterar a cópia não altera o que está gravado', async () => {
        await repository.add(aMember(1, { full: true }));

        const copy = (await repository.findById(org, memberId(1)))!;
        copy.updateProfile(
          { fullName: PersonName.create('Alterada Só Aqui') },
          NOW,
        );

        expect(
          (await repository.findById(org, memberId(1)))?.fullName.value,
        ).toBe('Maria da Silva 1');
      });
    });

    describe('histórico', () => {
      it('add grava o evento REGISTERED', async () => {
        await repository.add(aMember(1, { congregation: 2 }));

        const history = await repository.listHistory(org, memberId(1));

        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({
          id: eventId(1),
          type: 'REGISTERED',
          occurredOn: date('2026-10-20'),
          toCongregationId: congId(2),
          fromCongregationId: null,
          notes: null,
        });
      });

      it('save acrescenta os eventos novos, do mais recente para o mais antigo, sem repetir os antigos', async () => {
        await repository.add(aMember(1, { congregation: 1 }));

        const member = (await repository.findById(org, memberId(1)))!;
        member.changeStatus('AWAY', eventId(2), after(NOW, 1_000));
        await repository.save(member);
        const again = (await repository.findById(org, memberId(1)))!;
        again.transferTo(congId(2), eventId(3), after(NOW, 2_000));
        await repository.save(again);

        const history = await repository.listHistory(org, memberId(1));
        expect(history.map((e) => e.type)).toEqual([
          'TRANSFER',
          'STATUS_CHANGE',
          'REGISTERED',
        ]);
        expect(history[0]).toMatchObject({
          fromCongregationId: congId(1),
          toCongregationId: congId(2),
        });
        expect(history[1]).toMatchObject({
          fromStatus: 'ACTIVE',
          toStatus: 'AWAY',
        });
      });

      it('guarda a data do fato e a observação de um batismo', async () => {
        await repository.add(aMember(1));
        const member = (await repository.findById(org, memberId(1)))!;
        member.recordEvent({
          type: 'BAPTISM',
          occurredOn: date('2010-03-14'),
          notes: 'Batizado em Recife',
          eventId: eventId(2),
          now: after(NOW, 1_000),
        });
        await repository.save(member);

        const [latest] = await repository.listHistory(org, memberId(1));

        expect(latest).toMatchObject({
          type: 'BAPTISM',
          occurredOn: date('2010-03-14'),
          notes: 'Batizado em Recife',
        });
      });

      it('não mostra o histórico de membro de OUTRA igreja', async () => {
        await repository.add(aMember(1));

        expect(await repository.listHistory(orgId(2), memberId(1))).toEqual([]);
      });
    });

    describe('save', () => {
      it('grava as alterações e avança a versão em 1', async () => {
        await repository.add(aMember(1, { full: true }));
        const member = (await repository.findById(org, memberId(1)))!;
        member.updateProfile(
          { phone: Phone.create('81 3333-4444'), address: null },
          NOW,
        );
        member.transferTo(congId(3), eventId(2), NOW);

        await repository.save(member);

        const found = (await repository.findById(org, memberId(1)))!;
        expect(found.phone?.value).toBe('8133334444');
        expect(found.address).toBeNull();
        expect(found.congregationId).toBe(congId(3));
        expect(found.version).toBe(1);
      });

      it('conflito de versão: a segunda gravação falha e NADA do que ela traria é gravado', async () => {
        await repository.add(aMember(1));
        const a = (await repository.findById(org, memberId(1)))!;
        const b = (await repository.findById(org, memberId(1)))!;
        a.changeStatus('AWAY', eventId(2), NOW);
        b.changeStatus('DECEASED', eventId(3), NOW);

        await repository.save(a);

        expect(await thrownByAsync(() => repository.save(b))).toBeInstanceOf(
          ConcurrencyConflictError,
        );
        const found = (await repository.findById(org, memberId(1)))!;
        expect(found.status).toBe('AWAY');
        expect(
          (await repository.listHistory(org, memberId(1))).map((e) => e.type),
        ).not.toContain('DECEASED');
      });

      it('membro inexistente: MemberNotFoundError', async () => {
        const ghost = aMember(9);

        expect(
          await thrownByAsync(() => repository.save(ghost)),
        ).toBeInstanceOf(MemberNotFoundError);
      });

      it('NÃO grava em membro de OUTRA igreja: é como se não existisse', async () => {
        await repository.add(aMember(1));
        const intruder = aMember(1, { organization: 2, congregation: 10 });

        expect(
          await thrownByAsync(() => repository.save(intruder)),
        ).toBeInstanceOf(MemberNotFoundError);
        expect(
          (await repository.findById(org, memberId(1)))?.congregationId,
        ).toBe(congId(1));
      });
    });

    describe('anonimização', () => {
      it('grava os dados apagados e limpa as observações dos eventos antigos', async () => {
        await repository.add(aMember(1, { full: true }));
        const member = (await repository.findById(org, memberId(1)))!;
        member.recordEvent({
          type: 'BAPTISM',
          occurredOn: date('2010-03-14'),
          notes: 'Observação com dado pessoal',
          eventId: eventId(2),
          now: after(NOW, 1_000),
        });
        await repository.save(member);

        const toAnonymize = (await repository.findById(org, memberId(1)))!;
        toAnonymize.anonymize(eventId(3), after(NOW, 2_000));
        await repository.save(toAnonymize);

        const found = (await repository.findById(org, memberId(1)))!;
        expect(found).toMatchObject({
          birthDate: null,
          phone: null,
          email: null,
          address: null,
        });
        expect(found.fullName.value).toBe('Membro anonimizado');
        expect(found.anonymizedAt).toEqual(after(NOW, 2_000));
        const history = await repository.listHistory(org, memberId(1));
        expect(history.map((e) => e.type)).toEqual([
          'ANONYMIZED',
          'BAPTISM',
          'REGISTERED',
        ]);
        expect(history.every((e) => e.notes === null)).toBe(true);
      });
    });

    describe('search', () => {
      async function seed() {
        await repository.add(
          aMember(1, { name: 'Ana Souza', congregation: 1 }),
        );
        await repository.add(
          aMember(2, { name: 'Álvaro Lima', congregation: 1 }),
        );
        await repository.add(
          aMember(3, { name: 'José Conceição', congregation: 2 }),
        );
        await repository.add(
          aMember(4, { name: 'Bruna Alves', congregation: 3 }),
        );
        await repository.add(
          aMember(5, { name: 'Maria Souza', congregation: 2 }),
        );
        // Outra igreja: nunca pode aparecer nas buscas da igreja 1.
        await repository.add(
          aMember(6, {
            name: 'Ana de Outra Igreja',
            organization: 2,
            congregation: 10,
          }),
        );
      }

      const everything = {
        congregationIds: null,
        term: null,
        status: null,
        limit: 50,
        offset: 0,
      } as const;
      const names = (page: { items: { fullName: string }[] }) =>
        page.items.map((i) => i.fullName);

      it('sem filtro, lista a igreja toda, em ordem alfabética SEM considerar acentos, e conta o total', async () => {
        await seed();

        const page = await repository.search(org, everything);

        expect(names(page)).toEqual([
          'Álvaro Lima',
          'Ana Souza',
          'Bruna Alves',
          'José Conceição',
          'Maria Souza',
        ]);
        expect(page.total).toBe(5);
      });

      it('devolve só o resumo: id, nome, congregação e situação', async () => {
        await seed();

        const [first] = (
          await repository.search(org, { ...everything, limit: 1 })
        ).items;

        expect(first).toEqual({
          id: memberId(2),
          fullName: 'Álvaro Lima',
          congregationId: congId(1),
          status: 'ACTIVE',
        });
      });

      it('ESCOPO: só enxerga as congregações permitidas; lista vazia enxerga nenhuma', async () => {
        await seed();

        const some = await repository.search(org, {
          ...everything,
          congregationIds: [congId(2)],
        });
        const none = await repository.search(org, {
          ...everything,
          congregationIds: [],
        });

        expect(names(some)).toEqual(['José Conceição', 'Maria Souza']);
        expect(some.total).toBe(2);
        expect(none).toEqual({ items: [], total: 0 });
      });

      it('busca por trecho do nome, sem diferenciar acento nem caixa', async () => {
        await seed();

        expect(
          names(await repository.search(org, { ...everything, term: 'jose' })),
        ).toEqual(['José Conceição']);
        expect(
          names(
            await repository.search(org, { ...everything, term: 'alvaro' }),
          ),
        ).toEqual(['Álvaro Lima']);
        expect(
          names(await repository.search(org, { ...everything, term: 'souza' })),
        ).toEqual(['Ana Souza', 'Maria Souza']);
      });

      it('os caracteres especiais do LIKE (% _ e \\) são texto comum', async () => {
        await seed();

        // A barra invertida é o escape do LIKE: sem tratá-la, `\a` viraria "um a" e casaria com quase todo mundo.
        expect(
          (await repository.search(org, { ...everything, term: '\\a' })).total,
        ).toBe(0);

        expect(
          (await repository.search(org, { ...everything, term: '%' })).total,
        ).toBe(0);
        expect(
          (await repository.search(org, { ...everything, term: '_' })).total,
        ).toBe(0);
        expect(
          (await repository.search(org, { ...everything, term: 'a_a' })).total,
        ).toBe(0);
      });

      it('combina escopo, termo e situação', async () => {
        await seed();
        const maria = (await repository.findById(org, memberId(5)))!;
        maria.changeStatus('AWAY', eventId(50), after(NOW, 1_000));
        await repository.save(maria);

        const page = await repository.search(org, {
          ...everything,
          congregationIds: [congId(2)],
          term: 'souza',
          status: 'AWAY',
        });

        expect(names(page)).toEqual(['Maria Souza']);
      });

      it('NUNCA devolve membros de outra igreja, nem pelo termo', async () => {
        await seed();

        const page = await repository.search(org, {
          ...everything,
          term: 'outra igreja',
        });

        expect(page).toEqual({ items: [], total: 0 });
        expect((await repository.search(orgId(2), everything)).total).toBe(1);
      });

      it('não lista membros anonimizados', async () => {
        await seed();
        const ana = (await repository.findById(org, memberId(1)))!;
        ana.anonymize(eventId(60), after(NOW, 1_000));
        await repository.save(ana);

        const page = await repository.search(org, everything);

        expect(page.total).toBe(4);
        expect(names(page)).not.toContain('Ana Souza');
        expect(names(page)).not.toContain('Membro anonimizado');
      });

      it('pagina, mantendo o total', async () => {
        await seed();

        const first = await repository.search(org, {
          ...everything,
          limit: 2,
          offset: 0,
        });
        const second = await repository.search(org, {
          ...everything,
          limit: 2,
          offset: 2,
        });
        const beyond = await repository.search(org, {
          ...everything,
          limit: 2,
          offset: 10,
        });

        expect(names(first)).toEqual(['Álvaro Lima', 'Ana Souza']);
        expect(names(second)).toEqual(['Bruna Alves', 'José Conceição']);
        expect(first.total).toBe(5);
        expect(second.total).toBe(5);
        expect(beyond).toEqual({ items: [], total: 5 });
      });
    });
  });
}

async function thrownByAsync(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

// `thrownBy` fica importado para quem estender esta bateria com verificações síncronas.
void thrownBy;
