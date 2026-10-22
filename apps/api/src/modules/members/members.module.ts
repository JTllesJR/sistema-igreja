import { Module, type Provider } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import type { AuditLog } from '../../shared/application/audit-log.js';
import type { Clock } from '../../shared/application/clock.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import { SystemClock } from '../../shared/infrastructure/system-clock.js';
import { UuidV7IdGenerator } from '../../shared/infrastructure/uuid-v7-id-generator.js';
import { AUDIT_LOG, AuditModule } from '../audit/index.js';
import {
  ORGANIZATION_QUERIES,
  OrganizationModule,
} from '../organization/index.js';
import type { OrganizationQueries } from '../organization/index.js';
import { AnonymizeMemberUseCase } from './application/anonymize-member.use-case.js';
import { ChangeMemberStatusUseCase } from './application/change-member-status.use-case.js';
import type { CongregationDirectory } from './application/congregation-directory.js';
import { GetMemberUseCase } from './application/get-member.use-case.js';
import { ListMembersUseCase } from './application/list-members.use-case.js';
import { RepositoryMemberQueries } from './application/member-queries.js';
import { GetMemberStatsUseCase } from './application/member-stats.use-case.js';
import { RecordMemberEventUseCase } from './application/record-member-event.use-case.js';
import { RegisterMemberUseCase } from './application/register-member.use-case.js';
import { TransferMemberUseCase } from './application/transfer-member.use-case.js';
import { UpdateMemberUseCase } from './application/update-member.use-case.js';
import type { MemberRepository } from './domain/member.repository.js';
import { OrganizationQueriesCongregationDirectory } from './infrastructure/organization-queries-congregation-directory.js';
import { PrismaMemberRepository } from './infrastructure/prisma-member.repository.js';
import {
  CLOCK,
  CONGREGATION_DIRECTORY,
  ID_GENERATOR,
  MEMBER_QUERIES,
  MEMBER_REPOSITORY,
} from './members.tokens.js';
import { MembersController } from './presentation/http/members.controller.js';

// Raiz de composição: os casos de uso não têm decorators do Nest (a camada application é pura); aqui cada porta é
// ligada à sua implementação.

/** Caso de uso que só precisa do repositório e da trilha de auditoria. */
function withRepositoryAndAudit<T>(
  UseCase: new (repository: MemberRepository, audit: AuditLog) => T,
): Provider {
  return {
    provide: UseCase,
    useFactory: (repository: MemberRepository, audit: AuditLog) =>
      new UseCase(repository, audit),
    inject: [MEMBER_REPOSITORY, AUDIT_LOG],
  };
}

/** Caso de uso que precisa de repositório, ids, relógio e trilha. */
function withMutationPorts<T>(
  UseCase: new (
    repository: MemberRepository,
    ids: IdGenerator,
    clock: Clock,
    audit: AuditLog,
  ) => T,
): Provider {
  return {
    provide: UseCase,
    useFactory: (
      repository: MemberRepository,
      ids: IdGenerator,
      clock: Clock,
      audit: AuditLog,
    ) => new UseCase(repository, ids, clock, audit),
    inject: [MEMBER_REPOSITORY, ID_GENERATOR, CLOCK, AUDIT_LOG],
  };
}

@Module({
  imports: [DatabaseModule, OrganizationModule, AuditModule],
  controllers: [MembersController],
  exports: [MEMBER_QUERIES],
  providers: [
    {
      provide: MEMBER_REPOSITORY,
      useFactory: (prisma: PrismaService) => new PrismaMemberRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CONGREGATION_DIRECTORY,
      useFactory: (queries: OrganizationQueries) =>
        new OrganizationQueriesCongregationDirectory(queries),
      inject: [ORGANIZATION_QUERIES],
    },
    {
      provide: MEMBER_QUERIES,
      useFactory: (repository: MemberRepository) =>
        new RepositoryMemberQueries(repository),
      inject: [MEMBER_REPOSITORY],
    },
    { provide: ID_GENERATOR, useFactory: () => new UuidV7IdGenerator() },
    { provide: CLOCK, useFactory: () => new SystemClock() },

    {
      provide: RegisterMemberUseCase,
      useFactory: (
        repository: MemberRepository,
        congregations: CongregationDirectory,
        ids: IdGenerator,
        clock: Clock,
        audit: AuditLog,
      ) =>
        new RegisterMemberUseCase(repository, congregations, ids, clock, audit),
      inject: [
        MEMBER_REPOSITORY,
        CONGREGATION_DIRECTORY,
        ID_GENERATOR,
        CLOCK,
        AUDIT_LOG,
      ],
    },
    {
      provide: UpdateMemberUseCase,
      useFactory: (
        repository: MemberRepository,
        clock: Clock,
        audit: AuditLog,
      ) => new UpdateMemberUseCase(repository, clock, audit),
      inject: [MEMBER_REPOSITORY, CLOCK, AUDIT_LOG],
    },
    {
      provide: TransferMemberUseCase,
      useFactory: (
        repository: MemberRepository,
        congregations: CongregationDirectory,
        ids: IdGenerator,
        clock: Clock,
        audit: AuditLog,
      ) =>
        new TransferMemberUseCase(repository, congregations, ids, clock, audit),
      inject: [
        MEMBER_REPOSITORY,
        CONGREGATION_DIRECTORY,
        ID_GENERATOR,
        CLOCK,
        AUDIT_LOG,
      ],
    },
    withMutationPorts(ChangeMemberStatusUseCase),
    withMutationPorts(RecordMemberEventUseCase),
    withMutationPorts(AnonymizeMemberUseCase),
    withRepositoryAndAudit(GetMemberUseCase),
    withRepositoryAndAudit(ListMembersUseCase),
    withRepositoryAndAudit(GetMemberStatsUseCase),
  ],
})
export class MembersModule {}
