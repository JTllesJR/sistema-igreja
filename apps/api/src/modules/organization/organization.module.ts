import { Module, type Provider } from '@nestjs/common';
import { DatabaseModule } from '../../platform/database/database.module.js';
import { PrismaService } from '../../platform/database/prisma.service.js';
import { CreateOrganizationUseCase } from './application/create-organization.use-case.js';
import { DeactivateCongregationUseCase } from './application/deactivate-congregation.use-case.js';
import { DesignateHeadquartersUseCase } from './application/designate-headquarters.use-case.js';
import { GetOrganizationUseCase } from './application/get-organization.use-case.js';
import type { IdGenerator } from '../../shared/application/id-generator.js';
import { ListCongregationsUseCase } from './application/list-congregations.use-case.js';
import { ReactivateCongregationUseCase } from './application/reactivate-congregation.use-case.js';
import { RegisterCongregationUseCase } from './application/register-congregation.use-case.js';
import { RenameOrganizationUseCase } from './application/rename-organization.use-case.js';
import { UpdateCongregationUseCase } from './application/update-congregation.use-case.js';
import type { OrganizationRepository } from './domain/organization.repository.js';
import { PrismaOrganizationQueries } from './infrastructure/prisma-organization-queries.js';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository.js';
import { CongregationsController } from './presentation/http/congregations.controller.js';
import { OrganizationController } from './presentation/http/organization.controller.js';
import { UuidV7IdGenerator } from '../../shared/infrastructure/uuid-v7-id-generator.js';
import {
  ID_GENERATOR,
  ORGANIZATION_QUERIES,
  ORGANIZATION_REPOSITORY,
} from './organization.tokens.js';

// Os casos de uso não têm decorators do Nest (a camada application é pura); é aqui, na "raiz de composição",
// que cada interface é ligada à sua implementação.

/** Caso de uso que precisa só do repositório. */
function withRepository<T>(
  UseCase: new (repository: OrganizationRepository) => T,
): Provider {
  return {
    provide: UseCase,
    useFactory: (repository: OrganizationRepository) => new UseCase(repository),
    inject: [ORGANIZATION_REPOSITORY],
  };
}

/** Caso de uso que precisa do repositório e do gerador de ids. */
function withRepositoryAndIds<T>(
  UseCase: new (repository: OrganizationRepository, ids: IdGenerator) => T,
): Provider {
  return {
    provide: UseCase,
    useFactory: (repository: OrganizationRepository, ids: IdGenerator) =>
      new UseCase(repository, ids),
    inject: [ORGANIZATION_REPOSITORY, ID_GENERATOR],
  };
}

@Module({
  imports: [DatabaseModule],
  controllers: [OrganizationController, CongregationsController],
  providers: [
    {
      provide: ORGANIZATION_REPOSITORY,
      useFactory: (prisma: PrismaService) =>
        new PrismaOrganizationRepository(prisma),
      inject: [PrismaService],
    },
    { provide: ID_GENERATOR, useFactory: () => new UuidV7IdGenerator() },
    {
      provide: ORGANIZATION_QUERIES,
      useFactory: (prisma: PrismaService) =>
        new PrismaOrganizationQueries(prisma),
      inject: [PrismaService],
    },

    withRepositoryAndIds(CreateOrganizationUseCase),
    withRepositoryAndIds(RegisterCongregationUseCase),
    withRepository(GetOrganizationUseCase),
    withRepository(RenameOrganizationUseCase),
    withRepository(ListCongregationsUseCase),
    withRepository(UpdateCongregationUseCase),
    withRepository(DeactivateCongregationUseCase),
    withRepository(ReactivateCongregationUseCase),
    withRepository(DesignateHeadquartersUseCase),
  ],
  // Os casos de uso também são exportados para testes e para o comando do operador (src/cli.ts).
  exports: [
    // API pública para os OUTROS módulos (ex.: identity-access confere se a igreja existe).
    ORGANIZATION_QUERIES,
    CreateOrganizationUseCase,
    RegisterCongregationUseCase,
    GetOrganizationUseCase,
    RenameOrganizationUseCase,
    ListCongregationsUseCase,
    UpdateCongregationUseCase,
    DeactivateCongregationUseCase,
    ReactivateCongregationUseCase,
    DesignateHeadquartersUseCase,
  ],
})
export class OrganizationModule {}
