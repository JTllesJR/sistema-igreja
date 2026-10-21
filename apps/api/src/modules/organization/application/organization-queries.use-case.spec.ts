import { describe, expect, it } from 'vitest';
import { OrganizationName } from '../domain/organization-name.js';
import { CreateOrganizationUseCase } from './create-organization.use-case.js';
import { DeactivateCongregationUseCase } from './deactivate-congregation.use-case.js';
import { GetOrganizationUseCase } from './get-organization.use-case.js';
import { ListCongregationsUseCase } from './list-congregations.use-case.js';
import { RegisterCongregationUseCase } from './register-congregation.use-case.js';
import { RenameOrganizationUseCase } from './rename-organization.use-case.js';
import { aTestBed } from './testing/test-bed.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';

describe('GetOrganizationUseCase', () => {
  it('devolve a organização do contexto', async () => {
    const { repository, context } = await aTestBed();

    const view = await new GetOrganizationUseCase(repository).execute(context);

    expect(view).toEqual({
      id: context.organizationId,
      name: 'Igreja Central',
    });
  });
});

describe('RenameOrganizationUseCase', () => {
  it('renomeia e persiste', async () => {
    const { repository, context } = await aTestBed();

    const view = await new RenameOrganizationUseCase(repository).execute(
      context,
      {
        name: '  Igreja   Nova ',
      },
    );

    expect(view.name).toBe('Igreja Nova');
    const stored = await repository.findById(context.organizationId);
    expect(stored?.name.equals(OrganizationName.create('Igreja Nova'))).toBe(
      true,
    );
  });

  it('rejeita nome inválido sem alterar nada', async () => {
    const { repository, context } = await aTestBed();

    await expect(
      new RenameOrganizationUseCase(repository).execute(context, { name: 'A' }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(
      (await repository.findById(context.organizationId))?.name.value,
    ).toBe('Igreja Central');
  });
});

describe('ListCongregationsUseCase', () => {
  async function bedWithCongregations() {
    const bed = await aTestBed();
    const register = new RegisterCongregationUseCase(bed.repository, bed.ids);
    await register.execute(bed.context, { name: 'Zona Sul' });
    await register.execute(bed.context, { name: 'água Branca' });
    await register.execute(bed.context, { name: 'Bela Vista' });
    return bed;
  }

  it('lista todas, ordenadas por nome ignorando caixa e acentos', async () => {
    const { repository, context } = await bedWithCongregations();

    const list = await new ListCongregationsUseCase(repository).execute(
      context,
      {},
    );

    expect(list.map((c) => c.name)).toEqual([
      'água Branca',
      'Bela Vista',
      'Sede',
      'Zona Sul',
    ]);
  });

  it('inclui o essencial de cada congregação na visão', async () => {
    const { repository, context, headquartersId } =
      await bedWithCongregations();

    const list = await new ListCongregationsUseCase(repository).execute(
      context,
      {},
    );
    const headquarters = list.find((c) => c.id === headquartersId);

    expect(headquarters).toEqual({
      id: headquartersId,
      name: 'Sede',
      isHeadquarters: true,
      status: 'ACTIVE',
      address: null,
      serviceTimes: [],
    });
  });

  it('filtra por status', async () => {
    const { repository, context } = await bedWithCongregations();
    const list = await new ListCongregationsUseCase(repository).execute(
      context,
      {},
    );
    const belaVista = list.find((c) => c.name === 'Bela Vista');
    await new DeactivateCongregationUseCase(repository).execute(context, {
      congregationId: belaVista?.id ?? '',
    });

    const inactive = await new ListCongregationsUseCase(repository).execute(
      context,
      {
        status: 'INACTIVE',
      },
    );
    const active = await new ListCongregationsUseCase(repository).execute(
      context,
      {
        status: 'ACTIVE',
      },
    );

    expect(inactive.map((c) => c.name)).toEqual(['Bela Vista']);
    expect(active).toHaveLength(3);
  });

  it('mostra apenas a organização do contexto (isolamento entre igrejas)', async () => {
    const bed = await bedWithCongregations();
    const other = await new CreateOrganizationUseCase(
      bed.repository,
      bed.ids,
    ).execute({
      name: 'Outra Igreja',
      headquarters: { name: 'Sede da Outra' },
    });

    const list = await new ListCongregationsUseCase(bed.repository).execute(
      { ...bed.context, organizationId: other.organizationId },
      {},
    );

    expect(list.map((c) => c.name)).toEqual(['Sede da Outra']);
  });
});
