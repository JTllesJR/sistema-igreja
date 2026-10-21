import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { InMemoryOrganizationRepository } from '../domain/testing/in-memory-organization.repository.js';
import { CreateOrganizationUseCase } from './create-organization.use-case.js';
import { SequentialIdGenerator } from './testing/test-bed.js';

function setup() {
  const repository = new InMemoryOrganizationRepository();
  const useCase = new CreateOrganizationUseCase(
    repository,
    new SequentialIdGenerator(),
  );
  return { repository, useCase };
}

describe('CreateOrganizationUseCase (UC-17)', () => {
  it('cria a organização com a sede e devolve os identificadores', async () => {
    const { repository, useCase } = setup();

    const result = await useCase.execute({
      name: 'Igreja Central',
      headquarters: { name: 'Sede' },
    });

    const stored = await repository.findById(result.organizationId);
    expect(stored?.name.value).toBe('Igreja Central');
    expect(stored?.headquarters.id).toBe(result.headquartersId);
    expect(stored?.headquarters.name.value).toBe('Sede');
    expect(stored?.headquarters.status).toBe('ACTIVE');
  });

  it('gera identificadores diferentes para a organização e para a sede', async () => {
    const { useCase } = setup();

    const result = await useCase.execute({
      name: 'Igreja Central',
      headquarters: { name: 'Sede' },
    });

    expect(result.organizationId).not.toBe(result.headquartersId);
  });

  it('guarda endereço e horários de culto da sede', async () => {
    const { repository, useCase } = setup();

    const result = await useCase.execute({
      name: 'Igreja Central',
      headquarters: {
        name: 'Sede',
        address: { street: 'Rua das Flores', city: 'Campinas', state: 'sp' },
        serviceTimes: [
          { weekday: 'SUNDAY', time: '19:00', name: 'Culto de celebração' },
        ],
      },
    });

    const headquarters = (await repository.findById(result.organizationId))
      ?.headquarters;
    expect(headquarters?.address?.toPrimitives().state).toBe('SP');
    expect(headquarters?.serviceTimes).toHaveLength(1);
  });

  it('não persiste nada quando o nome da igreja é inválido', async () => {
    const { repository, useCase } = setup();

    await expect(
      useCase.execute({ name: ' ', headquarters: { name: 'Sede' } }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(repository.size).toBe(0);
  });

  it('não persiste nada quando a sede é inválida (nome ou endereço)', async () => {
    const { repository, useCase } = setup();

    await expect(
      useCase.execute({ name: 'Igreja', headquarters: { name: '' } }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute({
        name: 'Igreja',
        headquarters: {
          name: 'Sede',
          address: { street: 'Rua', city: 'Cidade', state: 'XX' },
        },
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(repository.size).toBe(0);
  });

  it('permite várias igrejas, cada uma com uma sede de mesmo nome (isolamento)', async () => {
    const { repository, useCase } = setup();

    const a = await useCase.execute({
      name: 'Igreja A',
      headquarters: { name: 'Sede' },
    });
    const b = await useCase.execute({
      name: 'Igreja B',
      headquarters: { name: 'Sede' },
    });

    expect(repository.size).toBe(2);
    expect(a.organizationId).not.toBe(b.organizationId);
  });
});
