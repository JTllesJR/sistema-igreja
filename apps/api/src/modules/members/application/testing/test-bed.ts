import type { RequestContext } from '../../../../shared/application/request-context.js';
import {
  ActorId,
  type CongregationId,
  type OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { FixedClock } from '../../../../shared/testing/fixed-clock.js';
import { InMemoryAuditLog } from '../../../../shared/testing/in-memory-audit-log.js';
import { SequentialIdGenerator } from '../../../../shared/testing/sequential-id-generator.js';
import { uuidFor } from '../../../../shared/testing/uuid-for.js';
import { InMemoryMemberRepository } from '../../domain/testing/in-memory-member.repository.js';
import { NOW, congId, orgId } from '../../domain/testing/fixtures.js';
import { AnonymizeMemberUseCase } from '../anonymize-member.use-case.js';
import { ChangeMemberStatusUseCase } from '../change-member-status.use-case.js';
import type { CongregationDirectory } from '../congregation-directory.js';
import { GetMemberUseCase } from '../get-member.use-case.js';
import { ListMembersUseCase } from '../list-members.use-case.js';
import type { MemberAccess } from '../member-access.js';
import { GetMemberStatsUseCase } from '../member-stats.use-case.js';
import { RecordMemberEventUseCase } from '../record-member-event.use-case.js';
import { RegisterMemberUseCase } from '../register-member.use-case.js';
import { TransferMemberUseCase } from '../transfer-member.use-case.js';
import { UpdateMemberUseCase } from '../update-member.use-case.js';

type Scope = 'ALL' | readonly CongregationId[];

/** O acesso de um usuário de teste: onde lê, onde escreve e se pode anonimizar. */
export class FakeMemberAccess implements MemberAccess {
  constructor(
    private readonly scopes: {
      read: Scope;
      write?: Scope;
      anonymize?: boolean;
    },
  ) {}

  readableCongregations(): readonly CongregationId[] | null {
    return this.scopes.read === 'ALL' ? null : this.scopes.read;
  }
  canRead(congregationId: CongregationId): boolean {
    return (
      this.scopes.read === 'ALL' || this.scopes.read.includes(congregationId)
    );
  }
  canWrite(congregationId: CongregationId): boolean {
    const write = this.scopes.write ?? [];
    return write === 'ALL' || write.includes(congregationId);
  }
  canAnonymize(): boolean {
    return this.scopes.anonymize ?? false;
  }
}

/** Quem pode tudo, na igreja toda (como o Administrador). */
export const everything = (): FakeMemberAccess =>
  new FakeMemberAccess({ read: 'ALL', write: 'ALL', anonymize: true });

/** Diretório de congregações de teste: cada igreja conhece as suas, com a situação de cada uma. */
export class FakeCongregationDirectory implements CongregationDirectory {
  readonly #known = new Map<string, 'ACTIVE' | 'INACTIVE'>();
  lookups = 0;

  set(
    organizationId: OrganizationId,
    congregationId: CongregationId,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ): void {
    this.#known.set(`${organizationId}:${congregationId}`, status);
  }

  statusOf(
    organizationId: OrganizationId,
    congregationId: CongregationId,
  ): Promise<'ACTIVE' | 'INACTIVE' | null> {
    this.lookups += 1;
    return Promise.resolve(
      this.#known.get(`${organizationId}:${congregationId}`) ?? null,
    );
  }
}

export const ACTOR = ActorId.of(uuidFor(900_000));

/**
 * Cenário padrão: a igreja 1 com as congregações 1, 2 e 3 (ativas) e a 4 (desativada); a igreja 2 com a congregação 10.
 * Todos os casos de uso montados sobre repositório e trilha em memória.
 */
export function aMembersBed() {
  const repository = new InMemoryMemberRepository();
  const audit = new InMemoryAuditLog();
  const clock = new FixedClock(NOW);
  const ids = new SequentialIdGenerator(100_000);
  const congregations = new FakeCongregationDirectory();
  for (const n of [1, 2, 3]) congregations.set(orgId(1), congId(n));
  congregations.set(orgId(1), congId(4), 'INACTIVE');
  congregations.set(orgId(2), congId(10));

  const contextOf = (organization = 1): RequestContext => ({
    organizationId: orgId(organization),
    actorId: ACTOR,
  });

  const register = new RegisterMemberUseCase(
    repository,
    congregations,
    ids,
    clock,
    audit,
  );

  /** Cadastra um membro como o administrador faria e devolve o id. */
  async function seed(
    fullName: string,
    congregation = 1,
    organization = 1,
  ): Promise<string> {
    const { id } = await register.execute(
      contextOf(organization),
      everything(),
      {
        congregationId: congId(congregation),
        fullName,
      },
    );
    audit.entries.length = 0; // os testes olham só o que acontece DEPOIS do cenário
    return id;
  }

  return {
    repository,
    audit,
    clock,
    ids,
    congregations,
    context: contextOf(1),
    contextOf,
    seed,
    register,
    update: new UpdateMemberUseCase(repository, clock, audit),
    changeStatus: new ChangeMemberStatusUseCase(repository, ids, clock, audit),
    transfer: new TransferMemberUseCase(
      repository,
      congregations,
      ids,
      clock,
      audit,
    ),
    recordEvent: new RecordMemberEventUseCase(repository, ids, clock, audit),
    anonymize: new AnonymizeMemberUseCase(repository, ids, clock, audit),
    get: new GetMemberUseCase(repository, audit),
    list: new ListMembersUseCase(repository, audit),
    stats: new GetMemberStatsUseCase(repository, audit),
  };
}
