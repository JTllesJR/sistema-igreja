import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import {
  CannotDeactivateHeadquartersError,
  CongregationInactiveError,
  CongregationNameAlreadyInUseError,
  CongregationNotFoundError,
} from '../domain/errors.js';
import { CongregationId } from '../domain/ids.js';
import { OrganizationName } from '../domain/organization-name.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { DeactivateCongregationUseCase } from './deactivate-congregation.use-case.js';
import { DesignateHeadquartersUseCase } from './designate-headquarters.use-case.js';
import { ReactivateCongregationUseCase } from './reactivate-congregation.use-case.js';
import { RegisterCongregationUseCase } from './register-congregation.use-case.js';
import { aTestBed, uuidFor } from './testing/test-bed.js';
import { UpdateCongregationUseCase } from './update-congregation.use-case.js';

const unknownCongregation = uuidFor(777777);

describe('RegisterCongregationUseCase (UC-05)', () => {
  it('registra uma congregação ativa e comum, gera o id e persiste', async () => {
    const { repository, ids, context } = await aTestBed();

    const view = await new RegisterCongregationUseCase(repository, ids).execute(
      context,
      { name: 'Congregação Norte' },
    );

    expect(view).toMatchObject({
      name: 'Congregação Norte',
      isHeadquarters: false,
      status: 'ACTIVE',
      address: null,
      serviceTimes: [],
    });
    const stored = await repository.findById(context.organizationId);
    expect(stored?.congregations).toHaveLength(2);
    expect(stored?.congregations.map((c) => c.id)).toContain(view.id);
  });

  it('guarda endereço e horários de culto', async () => {
    const { repository, ids, context } = await aTestBed();

    const view = await new RegisterCongregationUseCase(repository, ids).execute(
      context,
      {
        name: 'Congregação Norte',
        address: {
          street: 'Rua das Flores',
          city: 'Campinas',
          state: 'SP',
          postalCode: '13015-904',
        },
        serviceTimes: [
          { weekday: 'SUNDAY', time: '19:00', name: 'Culto de celebração' },
        ],
      },
    );

    expect(view.address?.postalCode).toBe('13015904');
    expect(view.serviceTimes).toEqual([
      { weekday: 'SUNDAY', time: '19:00', name: 'Culto de celebração' },
    ]);
  });

  it('rejeita nome repetido (ignorando caixa e acentos) e não persiste', async () => {
    const { repository, ids, context } = await aTestBed();

    await expect(
      new RegisterCongregationUseCase(repository, ids).execute(context, {
        name: 'SEDE',
      }),
    ).rejects.toBeInstanceOf(CongregationNameAlreadyInUseError);

    expect(
      (await repository.findById(context.organizationId))?.congregations,
    ).toHaveLength(1);
  });

  it('rejeita endereço inválido e não persiste', async () => {
    const { repository, ids, context } = await aTestBed();

    await expect(
      new RegisterCongregationUseCase(repository, ids).execute(context, {
        name: 'Congregação Norte',
        address: { street: 'Rua', city: 'Cidade', state: 'XX' },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(
      (await repository.findById(context.organizationId))?.congregations,
    ).toHaveLength(1);
  });

  it('propaga o conflito quando outra gravação acontece no meio (travamento otimista)', async () => {
    const { repository, ids, context } = await aTestBed();
    // Repositório "azarado": entre a leitura e a gravação do caso de uso, outra operação grava primeiro.
    const racing: OrganizationRepository = {
      findById: (id) => repository.findById(id),
      add: (organization) => repository.add(organization),
      save: async (organization) => {
        const competitor = await repository.findById(organization.id);
        competitor?.rename(OrganizationName.create('Gravou primeiro'));
        if (competitor) await repository.save(competitor);
        await repository.save(organization);
      },
    };

    await expect(
      new RegisterCongregationUseCase(racing, ids).execute(context, {
        name: 'Congregação Norte',
      }),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);

    const stored = await repository.findById(context.organizationId);
    expect(stored?.name.value).toBe('Gravou primeiro');
    expect(stored?.congregations).toHaveLength(1);
  });
});

describe('UpdateCongregationUseCase (UC-05)', () => {
  async function bedWithNorth() {
    const bed = await aTestBed();
    const north = await new RegisterCongregationUseCase(
      bed.repository,
      bed.ids,
    ).execute(bed.context, { name: 'Congregação Norte' });
    return { ...bed, northId: north.id };
  }

  it('altera nome, endereço e horários', async () => {
    const { repository, context, northId } = await bedWithNorth();

    const view = await new UpdateCongregationUseCase(repository).execute(
      context,
      {
        congregationId: northId,
        name: 'Congregação Leste',
        address: { street: 'Rua Nova', city: 'Sumaré', state: 'SP' },
        serviceTimes: [{ weekday: 'SUNDAY', time: '09:00', name: 'EBD' }],
      },
    );

    expect(view.name).toBe('Congregação Leste');
    expect(view.address?.city).toBe('Sumaré');
    expect(view.serviceTimes).toHaveLength(1);
  });

  it('mantém o que não foi informado e remove o endereço com null', async () => {
    const { repository, context, northId } = await bedWithNorth();
    const update = new UpdateCongregationUseCase(repository);
    await update.execute(context, {
      congregationId: northId,
      address: { street: 'Rua Nova', city: 'Sumaré', state: 'SP' },
    });

    const renamed = await update.execute(context, {
      congregationId: northId,
      name: 'Leste',
    });
    expect(renamed.address).not.toBeNull();

    const cleared = await update.execute(context, {
      congregationId: northId,
      address: null,
    });
    expect(cleared.address).toBeNull();
    expect(cleared.name).toBe('Leste');
  });

  it('rejeita o nome de outra congregação', async () => {
    const { repository, context, northId } = await bedWithNorth();

    await expect(
      new UpdateCongregationUseCase(repository).execute(context, {
        congregationId: northId,
        name: 'sede',
      }),
    ).rejects.toBeInstanceOf(CongregationNameAlreadyInUseError);
  });

  it('rejeita congregação inexistente e identificador malformado', async () => {
    const { repository, context } = await bedWithNorth();
    const update = new UpdateCongregationUseCase(repository);

    await expect(
      update.execute(context, {
        congregationId: unknownCongregation,
        name: 'X1',
      }),
    ).rejects.toBeInstanceOf(CongregationNotFoundError);
    await expect(
      update.execute(context, { congregationId: 'abc', name: 'X1' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('não persiste nada quando uma parte da alteração é inválida', async () => {
    const { repository, context, northId } = await bedWithNorth();

    await expect(
      new UpdateCongregationUseCase(repository).execute(context, {
        congregationId: northId,
        name: 'Congregação Leste',
        serviceTimes: [
          { weekday: 'SUNDAY', time: '19:00', name: 'A' },
          { weekday: 'SUNDAY', time: '19:00', name: 'B' },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    const stored = await repository.findById(context.organizationId);
    expect(stored?.congregations.map((c) => c.name.value)).not.toContain(
      'Congregação Leste',
    );
  });
});

describe('DeactivateCongregationUseCase / ReactivateCongregationUseCase (UC-05)', () => {
  it('desativa e reativa uma congregação comum, persistindo cada passo', async () => {
    const bed = await aTestBed();
    const north = await new RegisterCongregationUseCase(
      bed.repository,
      bed.ids,
    ).execute(bed.context, { name: 'Congregação Norte' });

    const off = await new DeactivateCongregationUseCase(bed.repository).execute(
      bed.context,
      {
        congregationId: north.id,
      },
    );
    expect(off.status).toBe('INACTIVE');
    const stored = await bed.repository.findById(bed.context.organizationId);
    expect(stored?.findCongregation(CongregationId.of(north.id))?.status).toBe(
      'INACTIVE',
    );

    const on = await new ReactivateCongregationUseCase(bed.repository).execute(
      bed.context,
      {
        congregationId: north.id,
      },
    );
    expect(on.status).toBe('ACTIVE');
    // A visão devolvida não prova nada sobre a gravação: confere o que ficou no repositório.
    const reloaded = await bed.repository.findById(bed.context.organizationId);
    expect(
      reloaded?.findCongregation(CongregationId.of(north.id))?.status,
    ).toBe('ACTIVE');
  });

  it('não desativa a sede', async () => {
    const { repository, context, headquartersId } = await aTestBed();

    await expect(
      new DeactivateCongregationUseCase(repository).execute(context, {
        congregationId: headquartersId,
      }),
    ).rejects.toBeInstanceOf(CannotDeactivateHeadquartersError);
  });

  it('rejeita congregação inexistente', async () => {
    const { repository, context } = await aTestBed();

    await expect(
      new DeactivateCongregationUseCase(repository).execute(context, {
        congregationId: unknownCongregation,
      }),
    ).rejects.toBeInstanceOf(CongregationNotFoundError);
    await expect(
      new ReactivateCongregationUseCase(repository).execute(context, {
        congregationId: unknownCongregation,
      }),
    ).rejects.toBeInstanceOf(CongregationNotFoundError);
  });
});

describe('DesignateHeadquartersUseCase (UC-05)', () => {
  it('troca a sede e persiste: exatamente uma sede, a nova', async () => {
    const { repository, ids, context, headquartersId } = await aTestBed();
    const north = await new RegisterCongregationUseCase(
      repository,
      ids,
    ).execute(context, {
      name: 'Congregação Norte',
    });

    const view = await new DesignateHeadquartersUseCase(repository).execute(
      context,
      {
        congregationId: north.id,
      },
    );

    expect(view.isHeadquarters).toBe(true);
    const stored = await repository.findById(context.organizationId);
    expect(stored?.congregations.filter((c) => c.isHeadquarters)).toHaveLength(
      1,
    );
    expect(stored?.headquarters.id).toBe(north.id);
    expect(
      stored?.congregations.find((c) => c.id === headquartersId)
        ?.isHeadquarters,
    ).toBe(false);
  });

  it('rejeita congregação inativa e mantém a sede atual', async () => {
    const { repository, ids, context, headquartersId } = await aTestBed();
    const north = await new RegisterCongregationUseCase(
      repository,
      ids,
    ).execute(context, {
      name: 'Congregação Norte',
    });
    await new DeactivateCongregationUseCase(repository).execute(context, {
      congregationId: north.id,
    });

    await expect(
      new DesignateHeadquartersUseCase(repository).execute(context, {
        congregationId: north.id,
      }),
    ).rejects.toBeInstanceOf(CongregationInactiveError);

    expect(
      (await repository.findById(context.organizationId))?.headquarters.id,
    ).toBe(headquartersId);
  });
});
