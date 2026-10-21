import type { RequestContext } from '../../../../shared/application/request-context.js';
import { ActorId } from '../../../../shared/domain/identifiers.js';
import { InMemoryOrganizationRepository } from '../../domain/testing/in-memory-organization.repository.js';
import { CreateOrganizationUseCase } from '../create-organization.use-case.js';
import type { IdGenerator } from '../id-generator.js';

/** Gera ids previsíveis (1, 2, 3...), o que torna os testes legíveis e determinísticos. */
export class SequentialIdGenerator implements IdGenerator {
  #counter = 0;

  next(): string {
    this.#counter += 1;
    return uuidFor(this.#counter);
  }
}

export const uuidFor = (n: number): string =>
  `0199c0a4-7b3e-7c11-8f2a-${String(n).padStart(12, '0')}`;

export const ACTOR = ActorId.of(uuidFor(900000));

/**
 * Cenário padrão dos testes: uma igreja "Igreja Central" já criada (com a sede "Sede")
 * e o contexto de quem a administra. Usa o próprio caso de uso de criação, como no uso real.
 */
export async function aTestBed() {
  const repository = new InMemoryOrganizationRepository();
  const ids = new SequentialIdGenerator();

  const created = await new CreateOrganizationUseCase(repository, ids).execute({
    name: 'Igreja Central',
    headquarters: { name: 'Sede' },
  });

  const context: RequestContext = {
    organizationId: created.organizationId,
    actorId: ACTOR,
  };

  return { repository, ids, context, headquartersId: created.headquartersId };
}
