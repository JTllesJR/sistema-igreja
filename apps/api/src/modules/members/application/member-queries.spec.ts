import { describe, expect, it } from 'vitest';
import { InMemoryMemberRepository } from '../domain/testing/in-memory-member.repository.js';
import {
  NOW,
  aMember,
  after,
  congId,
  eventId,
  memberId,
  orgId,
} from '../domain/testing/fixtures.js';
import { RepositoryMemberQueries } from './member-queries.js';

async function setup() {
  const repository = new InMemoryMemberRepository();
  await repository.add(aMember(1, { name: 'José Conceição', congregation: 1 }));
  await repository.add(aMember(2, { name: 'Ana Souza', congregation: 2 }));
  await repository.add(
    aMember(3, {
      name: 'Ana de Outra Igreja',
      organization: 2,
      congregation: 10,
    }),
  );
  return { repository, queries: new RepositoryMemberQueries(repository) };
}

describe('MemberQueries (API pública para outros módulos)', () => {
  it('devolve só o mínimo: id, nome e congregação', async () => {
    const { queries } = await setup();

    const found = await queries.find(orgId(1), memberId(1));

    expect(found).toEqual({
      id: memberId(1),
      fullName: 'José Conceição',
      congregationId: congId(1),
    });
  });

  it('não acha membro de outra igreja nem anonimizado', async () => {
    const { repository, queries } = await setup();
    const ana = (await repository.findById(orgId(1), memberId(2)))!;
    ana.anonymize(eventId(90), after(NOW, 1_000));
    await repository.save(ana);

    expect(await queries.find(orgId(1), memberId(3))).toBeNull();
    expect(await queries.find(orgId(1), memberId(2))).toBeNull();
    expect(
      await queries.findMany(orgId(1), [memberId(1), memberId(2), memberId(3)]),
    ).toHaveLength(1);
  });

  it('busca por parte do nome sem diferenciar acento nem caixa, dentro do escopo e do limite', async () => {
    const { queries } = await setup();
    const search = (
      term: string | null,
      congregationIds: ReturnType<typeof congId>[] | null = null,
      limit = 10,
    ) => queries.search(orgId(1), { congregationIds, term, limit });

    expect((await search('JOSE')).map((m) => m.fullName)).toEqual([
      'José Conceição',
    ]);
    expect((await search('ana')).map((m) => m.id)).toEqual([memberId(2)]);
    expect(await search('ana', [congId(1)])).toEqual([]);
    expect(await search(null, null, 1)).toHaveLength(1);
  });
});
