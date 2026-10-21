import { beforeEach, describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import { OrganizationName } from '../organization-name.js';
import {
  OrganizationAlreadyExistsError,
  OrganizationNotFoundError,
} from '../errors.js';
import { Organization } from '../organization.js';
import type { OrganizationRepository } from '../organization.repository.js';
import { anAddress, congId, name, orgId, sundayEvening } from './fixtures.js';

/** Foto comparável de uma organização (sem ordem garantida entre congregações). */
function snapshot(organization: Organization) {
  return {
    id: organization.id,
    name: organization.name.value,
    version: organization.version,
    congregations: organization.congregations
      .map((c) => ({
        id: c.id,
        name: c.name.value,
        isHeadquarters: c.isHeadquarters,
        status: c.status,
        address: c.address?.toPrimitives() ?? null,
        serviceTimes: c.serviceTimes.map((s) => s.toPrimitives()),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function anOrganization(): Organization {
  return Organization.create({
    id: orgId(1),
    name: OrganizationName.create('Igreja Central'),
    headquarters: { id: congId(1), name: name('Sede') },
  });
}

/**
 * Contrato que TODA implementação de `OrganizationRepository` precisa cumprir.
 * Roda contra o repositório em memória (unitário) e, depois, contra o Prisma/PostgreSQL (integração):
 * a mesma bateria nas duas garante que o fake usado nos testes dos casos de uso se comporta como o real.
 *
 * `makeRepository` deve devolver um repositório VAZIO a cada chamada.
 */
export function describeOrganizationRepositoryContract(
  label: string,
  makeRepository: () =>
    OrganizationRepository | Promise<OrganizationRepository>,
): void {
  describe(`OrganizationRepository (${label})`, () => {
    let repository: OrganizationRepository;

    beforeEach(async () => {
      repository = await makeRepository();
    });

    it('add + findById devolve a organização com sua sede, na versão 0', async () => {
      await repository.add(anOrganization());

      const found = await repository.findById(orgId(1));

      expect(found).not.toBeNull();
      expect(found?.name.value).toBe('Igreja Central');
      expect(found?.version).toBe(0);
      expect(found?.headquarters.id).toBe(congId(1));
    });

    it('findById de um id desconhecido devolve null', async () => {
      await expect(repository.findById(orgId(99))).resolves.toBeNull();
    });

    it('preserva endereço, horários, status e sede de cada congregação', async () => {
      const organization = anOrganization();
      organization.registerCongregation({
        id: congId(2),
        name: name('Congregação Norte'),
        address: anAddress(),
        serviceTimes: [sundayEvening()],
      });
      organization.registerCongregation({
        id: congId(3),
        name: name('Congregação Sul'),
      });
      organization.deactivateCongregation(congId(3));
      await repository.add(organization);

      const found = await repository.findById(orgId(1));

      expect(snapshot(found as Organization)).toEqual(snapshot(organization));
    });

    it('devolve cópias independentes: alterar o que foi lido não muda o armazenado sem salvar', async () => {
      await repository.add(anOrganization());

      const loaded = (await repository.findById(orgId(1))) as Organization;
      loaded.registerCongregation({
        id: congId(2),
        name: name('Congregação Norte'),
      });

      const again = (await repository.findById(orgId(1))) as Organization;
      expect(again.congregations).toHaveLength(1);
    });

    it('save grava as alterações e incrementa a versão', async () => {
      await repository.add(anOrganization());
      const loaded = (await repository.findById(orgId(1))) as Organization;
      loaded.registerCongregation({
        id: congId(2),
        name: name('Congregação Norte'),
      });
      loaded.rename(OrganizationName.create('Igreja Nova'));

      await repository.save(loaded);

      const again = (await repository.findById(orgId(1))) as Organization;
      expect(again.version).toBe(1);
      expect(again.name.value).toBe('Igreja Nova');
      expect(again.congregations).toHaveLength(2);
    });

    it('save grava a troca de sede, deixando exatamente uma', async () => {
      const organization = anOrganization();
      organization.registerCongregation({
        id: congId(2),
        name: name('Congregação Norte'),
      });
      await repository.add(organization);

      const loaded = (await repository.findById(orgId(1))) as Organization;
      loaded.designateHeadquarters(congId(2));
      await repository.save(loaded);

      const again = (await repository.findById(orgId(1))) as Organization;
      expect(again.headquarters.id).toBe(congId(2));
      expect(again.congregations.filter((c) => c.isHeadquarters)).toHaveLength(
        1,
      );
      expect(again.findCongregation(congId(1))?.isHeadquarters).toBe(false);
    });

    it('save com versão desatualizada falha com conflito e não sobrescreve', async () => {
      await repository.add(anOrganization());
      const first = (await repository.findById(orgId(1))) as Organization;
      const second = (await repository.findById(orgId(1))) as Organization;

      first.rename(OrganizationName.create('Primeiro a salvar'));
      await repository.save(first);

      second.rename(OrganizationName.create('Chegou atrasado'));
      await expect(repository.save(second)).rejects.toBeInstanceOf(
        ConcurrencyConflictError,
      );

      const stored = (await repository.findById(orgId(1))) as Organization;
      expect(stored.name.value).toBe('Primeiro a salvar');
    });

    it('add de um id que já existe é rejeitado', async () => {
      await repository.add(anOrganization());

      await expect(repository.add(anOrganization())).rejects.toBeInstanceOf(
        OrganizationAlreadyExistsError,
      );
    });

    it('save de uma organização que nunca foi adicionada é rejeitado', async () => {
      await expect(repository.save(anOrganization())).rejects.toBeInstanceOf(
        OrganizationNotFoundError,
      );
    });
  });
}
