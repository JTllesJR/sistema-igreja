import { describe, expect, it } from 'vitest';
import type { RequestContext } from '../../../shared/application/request-context.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import {
  CongregationNotFoundError,
  OrganizationNotFoundError,
} from '../domain/errors.js';
import { CreateOrganizationUseCase } from './create-organization.use-case.js';
import { DeactivateCongregationUseCase } from './deactivate-congregation.use-case.js';
import { DesignateHeadquartersUseCase } from './designate-headquarters.use-case.js';
import { GetOrganizationUseCase } from './get-organization.use-case.js';
import { ListCongregationsUseCase } from './list-congregations.use-case.js';
import { ReactivateCongregationUseCase } from './reactivate-congregation.use-case.js';
import { RegisterCongregationUseCase } from './register-congregation.use-case.js';
import { RenameOrganizationUseCase } from './rename-organization.use-case.js';
import { aTestBed, uuidFor } from './testing/test-bed.js';
import { UpdateCongregationUseCase } from './update-congregation.use-case.js';

type Bed = Awaited<ReturnType<typeof aTestBed>>;
type Run = (bed: Bed, context: RequestContext) => Promise<unknown>;

const everyUseCase: [string, Run][] = [
  [
    'GetOrganization',
    (b, c) => new GetOrganizationUseCase(b.repository).execute(c),
  ],
  [
    'RenameOrganization',
    (b, c) =>
      new RenameOrganizationUseCase(b.repository).execute(c, {
        name: 'Nova Igreja',
      }),
  ],
  [
    'ListCongregations',
    (b, c) => new ListCongregationsUseCase(b.repository).execute(c, {}),
  ],
  [
    'RegisterCongregation',
    (b, c) =>
      new RegisterCongregationUseCase(b.repository, b.ids).execute(c, {
        name: 'Norte',
      }),
  ],
  [
    'UpdateCongregation',
    (b, c) =>
      new UpdateCongregationUseCase(b.repository).execute(c, {
        congregationId: b.headquartersId,
        name: 'Outra',
      }),
  ],
  [
    'DeactivateCongregation',
    (b, c) =>
      new DeactivateCongregationUseCase(b.repository).execute(c, {
        congregationId: b.headquartersId,
      }),
  ],
  [
    'ReactivateCongregation',
    (b, c) =>
      new ReactivateCongregationUseCase(b.repository).execute(c, {
        congregationId: b.headquartersId,
      }),
  ],
  [
    'DesignateHeadquarters',
    (b, c) =>
      new DesignateHeadquartersUseCase(b.repository).execute(c, {
        congregationId: b.headquartersId,
      }),
  ],
];

describe('Contexto de uma organização inexistente', () => {
  it.each(everyUseCase)(
    '%s falha com OrganizationNotFoundError',
    async (_nome, run) => {
      const bed = await aTestBed();
      const ghost: RequestContext = {
        ...bed.context,
        organizationId: OrganizationId.of(uuidFor(888888)),
      };

      await expect(run(bed, ghost)).rejects.toBeInstanceOf(
        OrganizationNotFoundError,
      );
    },
  );
});

describe('Isolamento entre igrejas (duas igrejas no mesmo repositório)', () => {
  async function twoChurches() {
    const a = await aTestBed();
    const b = await new CreateOrganizationUseCase(a.repository, a.ids).execute({
      name: 'Igreja B',
      headquarters: { name: 'Sede B' },
    });
    return { a, b };
  }

  it('quem é da igreja A não consegue desativar a congregação da igreja B, mesmo conhecendo o id', async () => {
    const { a, b } = await twoChurches();

    await expect(
      new DeactivateCongregationUseCase(a.repository).execute(a.context, {
        congregationId: b.headquartersId,
      }),
    ).rejects.toBeInstanceOf(CongregationNotFoundError);

    const bStored = await a.repository.findById(b.organizationId);
    expect(bStored?.headquarters.status).toBe('ACTIVE');
  });

  it('quem é da igreja A não consegue alterar nem designar como sede a congregação da B', async () => {
    const { a, b } = await twoChurches();

    await expect(
      new UpdateCongregationUseCase(a.repository).execute(a.context, {
        congregationId: b.headquartersId,
        name: 'Invadida',
      }),
    ).rejects.toBeInstanceOf(CongregationNotFoundError);
    await expect(
      new DesignateHeadquartersUseCase(a.repository).execute(a.context, {
        congregationId: b.headquartersId,
      }),
    ).rejects.toBeInstanceOf(CongregationNotFoundError);

    expect(
      (await a.repository.findById(b.organizationId))?.headquarters.name.value,
    ).toBe('Sede B');
  });
});
