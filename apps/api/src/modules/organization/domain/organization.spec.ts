import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { Congregation } from './congregation.js';
import {
  CannotDeactivateHeadquartersError,
  CongregationAlreadyHeadquartersError,
  CongregationInactiveError,
  CongregationNameAlreadyInUseError,
  CongregationNotFoundError,
  OrganizationStateCorruptedError,
} from './errors.js';
import { Organization } from './organization.js';
import { OrganizationName } from './organization-name.js';
import {
  anAddress,
  congId,
  name,
  orgId,
  sundayEvening,
  wednesdayEvening,
} from './testing/fixtures.js';

function anOrganization(): Organization {
  return Organization.create({
    id: orgId(),
    name: OrganizationName.create('Igreja Central'),
    headquarters: { id: congId(1), name: name('Sede') },
  });
}

/** Organização com a sede (1) e duas congregações comuns (2 e 3). */
function aGrownOrganization(): Organization {
  const organization = anOrganization();
  organization.registerCongregation({
    id: congId(2),
    name: name('Congregação Norte'),
  });
  organization.registerCongregation({
    id: congId(3),
    name: name('Congregação Sul'),
  });
  return organization;
}

/** Invariantes que valem depois de QUALQUER operação (regras 1 e 2 do ADR 0009). */
function expectInvariants(organization: Organization): void {
  const all = organization.congregations;
  const headquarters = all.filter((c) => c.isHeadquarters);

  expect(headquarters).toHaveLength(1);
  expect(headquarters[0]?.status).toBe('ACTIVE');

  for (const [index, congregation] of all.entries()) {
    for (const other of all.slice(index + 1)) {
      expect(congregation.name.equals(other.name)).toBe(false);
    }
  }
}

describe('Organization', () => {
  describe('criação', () => {
    it('nasce com uma única congregação: a sede, ativa', () => {
      const organization = anOrganization();

      expect(organization.congregations).toHaveLength(1);
      expect(organization.headquarters.id).toBe(congId(1));
      expect(organization.headquarters.status).toBe('ACTIVE');
      expectInvariants(organization);
    });

    it('começa na versão 0', () => {
      expect(anOrganization().version).toBe(0);
    });

    it('a lista de congregações exposta é uma cópia', () => {
      const organization = anOrganization();

      (organization.congregations as Congregation[]).pop();

      expect(organization.congregations).toHaveLength(1);
    });
  });

  describe('renomear a igreja', () => {
    it('troca o nome', () => {
      const organization = anOrganization();

      organization.rename(OrganizationName.create('Igreja Nova'));

      expect(organization.name.value).toBe('Igreja Nova');
    });
  });

  describe('registrar congregação', () => {
    it('adiciona uma congregação ativa que não é sede', () => {
      const organization = anOrganization();

      const created = organization.registerCongregation({
        id: congId(2),
        name: name('Congregação Norte'),
      });

      expect(created.status).toBe('ACTIVE');
      expect(created.isHeadquarters).toBe(false);
      expect(organization.congregations).toHaveLength(2);
      expectInvariants(organization);
    });

    it('guarda endereço e horários de culto informados', () => {
      const organization = anOrganization();

      const created = organization.registerCongregation({
        id: congId(2),
        name: name('Congregação Norte'),
        address: anAddress(),
        serviceTimes: [sundayEvening(), wednesdayEvening()],
      });

      expect(created.address).not.toBeNull();
      expect(created.serviceTimes).toHaveLength(2);
    });

    it('rejeita nome já usado, ignorando caixa e acentos', () => {
      const organization = aGrownOrganization();

      for (const repeated of [
        'Congregação Norte',
        'CONGREGACAO NORTE',
        '  congregação   norte ',
      ]) {
        expect(() =>
          organization.registerCongregation({
            id: congId(9),
            name: name(repeated),
          }),
        ).toThrow(CongregationNameAlreadyInUseError);
      }
    });

    it('rejeita o nome da própria sede', () => {
      expect(() =>
        anOrganization().registerCongregation({
          id: congId(2),
          name: name('SEDE'),
        }),
      ).toThrow(CongregationNameAlreadyInUseError);
    });

    it('rejeita nome de uma congregação inativa (o nome continua reservado)', () => {
      const organization = aGrownOrganization();
      organization.deactivateCongregation(congId(2));

      expect(() =>
        organization.registerCongregation({
          id: congId(9),
          name: name('Congregação Norte'),
        }),
      ).toThrow(CongregationNameAlreadyInUseError);
    });

    it('rejeita um identificador que já existe', () => {
      expect(() =>
        anOrganization().registerCongregation({
          id: congId(1),
          name: name('Outra'),
        }),
      ).toThrow(ValidationError);
    });

    it('não altera nada quando falha', () => {
      const organization = anOrganization();

      expect(() =>
        organization.registerCongregation({
          id: congId(2),
          name: name('Sede'),
        }),
      ).toThrow();

      expect(organization.congregations).toHaveLength(1);
    });
  });

  describe('alterar dados de uma congregação', () => {
    it('renomeia, troca endereço e horários', () => {
      const organization = aGrownOrganization();

      const updated = organization.updateCongregation(congId(2), {
        name: name('Congregação Leste'),
        address: anAddress(),
        serviceTimes: [sundayEvening()],
      });

      expect(updated.name.value).toBe('Congregação Leste');
      expect(updated.address).not.toBeNull();
      expect(updated.serviceTimes).toHaveLength(1);
      expect(organization.findCongregation(congId(2))).toBe(updated);
    });

    it('o que não foi informado permanece como está', () => {
      const organization = aGrownOrganization();
      organization.updateCongregation(congId(2), { address: anAddress() });

      const updated = organization.updateCongregation(congId(2), {
        name: name('Congregação Leste'),
      });

      expect(updated.address).not.toBeNull();
    });

    it('permite remover o endereço informando null', () => {
      const organization = aGrownOrganization();
      organization.updateCongregation(congId(2), { address: anAddress() });

      const updated = organization.updateCongregation(congId(2), {
        address: null,
      });

      expect(updated.address).toBeNull();
    });

    it('permite trocar só a grafia do próprio nome (não conflita consigo mesma)', () => {
      const organization = aGrownOrganization();

      const updated = organization.updateCongregation(congId(2), {
        name: name('CONGREGAÇÃO NORTE'),
      });

      expect(updated.name.value).toBe('CONGREGAÇÃO NORTE');
    });

    it('rejeita o nome de outra congregação', () => {
      const organization = aGrownOrganization();

      expect(() =>
        organization.updateCongregation(congId(2), {
          name: name('congregacao sul'),
        }),
      ).toThrow(CongregationNameAlreadyInUseError);
    });

    it('rejeita congregação inexistente', () => {
      expect(() =>
        aGrownOrganization().updateCongregation(congId(99), { address: null }),
      ).toThrow(CongregationNotFoundError);
    });

    it('é atômico: se uma parte da alteração é inválida, nada é aplicado', () => {
      const organization = aGrownOrganization();

      expect(() =>
        organization.updateCongregation(congId(2), {
          name: name('Congregação Leste'),
          serviceTimes: [sundayEvening(), sundayEvening()],
        }),
      ).toThrow(ValidationError);

      expect(organization.findCongregation(congId(2))?.name.value).toBe(
        'Congregação Norte',
      );
    });
  });

  describe('desativar e reativar', () => {
    it('desativa uma congregação comum e a reativa', () => {
      const organization = aGrownOrganization();

      expect(organization.deactivateCongregation(congId(2)).status).toBe(
        'INACTIVE',
      );
      expect(organization.reactivateCongregation(congId(2)).status).toBe(
        'ACTIVE',
      );
      expectInvariants(organization);
    });

    it('não desativa a sede', () => {
      const organization = aGrownOrganization();

      expect(() => organization.deactivateCongregation(congId(1))).toThrow(
        CannotDeactivateHeadquartersError,
      );
      expectInvariants(organization);
    });

    it('rejeita congregação inexistente', () => {
      expect(() => anOrganization().deactivateCongregation(congId(99))).toThrow(
        CongregationNotFoundError,
      );
      expect(() => anOrganization().reactivateCongregation(congId(99))).toThrow(
        CongregationNotFoundError,
      );
    });
  });

  describe('designar a sede', () => {
    it('troca a sede: a antiga deixa de ser, a nova passa a ser, e há exatamente uma', () => {
      const organization = aGrownOrganization();

      const newHeadquarters = organization.designateHeadquarters(congId(2));

      expect(newHeadquarters.id).toBe(congId(2));
      expect(organization.headquarters.id).toBe(congId(2));
      expect(organization.findCongregation(congId(1))?.isHeadquarters).toBe(
        false,
      );
      expectInvariants(organization);
    });

    it('depois da troca, a sede antiga pode ser desativada', () => {
      const organization = aGrownOrganization();
      organization.designateHeadquarters(congId(2));

      expect(organization.deactivateCongregation(congId(1)).status).toBe(
        'INACTIVE',
      );
      expectInvariants(organization);
    });

    it('rejeita uma congregação inativa e mantém a sede atual', () => {
      const organization = aGrownOrganization();
      organization.deactivateCongregation(congId(2));

      expect(() => organization.designateHeadquarters(congId(2))).toThrow(
        CongregationInactiveError,
      );
      expect(organization.headquarters.id).toBe(congId(1));
      expectInvariants(organization);
    });

    it('rejeita quem já é a sede', () => {
      expect(() =>
        aGrownOrganization().designateHeadquarters(congId(1)),
      ).toThrow(CongregationAlreadyHeadquartersError);
    });

    it('rejeita congregação inexistente', () => {
      expect(() =>
        aGrownOrganization().designateHeadquarters(congId(99)),
      ).toThrow(CongregationNotFoundError);
    });
  });

  describe('invariantes ao longo de uma sequência de operações', () => {
    it('mantém sede única e nomes únicos', () => {
      const organization = aGrownOrganization();

      organization.registerCongregation({
        id: congId(4),
        name: name('Congregação Leste'),
      });
      expectInvariants(organization);
      organization.designateHeadquarters(congId(3));
      expectInvariants(organization);
      organization.deactivateCongregation(congId(1));
      expectInvariants(organization);
      organization.designateHeadquarters(congId(4));
      expectInvariants(organization);
      organization.reactivateCongregation(congId(1));
      expectInvariants(organization);
      organization.updateCongregation(congId(3), {
        name: name('Congregação Sul 2'),
      });
      expectInvariants(organization);
    });
  });

  describe('restore (leitura do banco)', () => {
    const aRestorable = (congregations: Congregation[], version = 7) =>
      Organization.restore({
        id: orgId(),
        name: OrganizationName.create('Igreja Central'),
        version,
        congregations,
      });

    const hq = (n = 1) =>
      Congregation.create({
        id: congId(n),
        name: name(`Sede ${n}`),
        isHeadquarters: true,
      });
    const common = (n: number, label = `Congregação ${n}`) =>
      Congregation.create({ id: congId(n), name: name(label) });

    it('reconstrói a organização preservando a versão lida', () => {
      const organization = aRestorable([hq(1), common(2)], 7);

      expect(organization.version).toBe(7);
      expect(organization.congregations).toHaveLength(2);
      expect(organization.headquarters.id).toBe(congId(1));
    });

    it('rejeita dados sem nenhuma sede', () => {
      expect(() => aRestorable([common(2)])).toThrow(
        OrganizationStateCorruptedError,
      );
    });

    it('rejeita dados com duas sedes', () => {
      expect(() => aRestorable([hq(1), hq(2)])).toThrow(
        OrganizationStateCorruptedError,
      );
    });

    it('rejeita sede inativa', () => {
      const inactiveHq = Congregation.restore({
        id: congId(1),
        name: name('Sede'),
        isHeadquarters: true,
        status: 'INACTIVE',
        address: null,
        serviceTimes: [],
      });

      expect(() => aRestorable([inactiveHq])).toThrow(
        OrganizationStateCorruptedError,
      );
    });

    it('rejeita nomes repetidos', () => {
      expect(() =>
        aRestorable([hq(1), common(2, 'Norte'), common(3, 'NORTE')]),
      ).toThrow(OrganizationStateCorruptedError);
    });

    it('rejeita identificadores repetidos', () => {
      expect(() => aRestorable([hq(1), common(1, 'Outra')])).toThrow(
        OrganizationStateCorruptedError,
      );
    });
  });
});
