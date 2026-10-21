import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { Congregation } from './congregation.js';
import {
  CannotDeactivateHeadquartersError,
  CongregationAlreadyHeadquartersError,
  CongregationAlreadyInStatusError,
  CongregationInactiveError,
} from './errors.js';
import {
  anAddress,
  congId,
  name,
  sundayEvening,
  wednesdayEvening,
} from './testing/fixtures.js';

function aCongregation(
  overrides: Partial<Parameters<typeof Congregation.create>[0]> = {},
) {
  return Congregation.create({
    id: congId(1),
    name: name('Congregação Norte'),
    ...overrides,
  });
}

describe('Congregation', () => {
  describe('criação', () => {
    it('nasce ativa, sem ser sede, sem endereço e sem horários', () => {
      const congregation = aCongregation();

      expect(congregation.status).toBe('ACTIVE');
      expect(congregation.isHeadquarters).toBe(false);
      expect(congregation.address).toBeNull();
      expect(congregation.serviceTimes).toEqual([]);
    });

    it('pode nascer como sede (decisão da raiz Organization)', () => {
      expect(aCongregation({ isHeadquarters: true }).isHeadquarters).toBe(true);
    });

    it('guarda endereço e horários informados', () => {
      const congregation = aCongregation({
        address: anAddress(),
        serviceTimes: [sundayEvening()],
      });

      expect(congregation.address?.equals(anAddress())).toBe(true);
      expect(congregation.serviceTimes).toHaveLength(1);
    });
  });

  describe('imutabilidade', () => {
    it('rename devolve outra instância e não altera a original', () => {
      const original = aCongregation();

      const renamed = original.rename(name('Congregação Sul'));

      expect(renamed.name.value).toBe('Congregação Sul');
      expect(original.name.value).toBe('Congregação Norte');
      expect(renamed.id).toBe(original.id);
    });

    it('não é afetada por mudanças feitas depois na lista de horários recebida', () => {
      const times = [sundayEvening()];
      const congregation = aCongregation({ serviceTimes: times });

      times.push(wednesdayEvening());

      expect(congregation.serviceTimes).toHaveLength(1);
    });
  });

  describe('edição de dados', () => {
    it('troca e remove o endereço', () => {
      const withAddress = aCongregation().changeAddress(anAddress());
      expect(withAddress.address).not.toBeNull();

      expect(withAddress.changeAddress(null).address).toBeNull();
    });

    it('troca a lista de horários de culto', () => {
      const updated = aCongregation().changeServiceTimes([
        sundayEvening(),
        wednesdayEvening(),
      ]);

      expect(updated.serviceTimes).toHaveLength(2);
    });

    it('rejeita dois cultos no mesmo dia e hora', () => {
      const act = () =>
        aCongregation().changeServiceTimes([sundayEvening(), sundayEvening()]);

      expect(act).toThrow(ValidationError);
    });
  });

  describe('desativar e reativar', () => {
    it('desativa uma congregação ativa que não é sede', () => {
      expect(aCongregation().deactivate().status).toBe('INACTIVE');
    });

    it('não desativa a sede', () => {
      expect(() =>
        aCongregation({ isHeadquarters: true }).deactivate(),
      ).toThrow(CannotDeactivateHeadquartersError);
    });

    it('não desativa quem já está inativa', () => {
      expect(() => aCongregation().deactivate().deactivate()).toThrow(
        CongregationAlreadyInStatusError,
      );
    });

    it('reativa uma congregação inativa', () => {
      expect(aCongregation().deactivate().reactivate().status).toBe('ACTIVE');
    });

    it('não reativa quem já está ativa', () => {
      expect(() => aCongregation().reactivate()).toThrow(
        CongregationAlreadyInStatusError,
      );
    });
  });

  describe('sede', () => {
    it('marca uma congregação ativa como sede', () => {
      expect(aCongregation().markAsHeadquarters().isHeadquarters).toBe(true);
    });

    it('não marca como sede uma congregação inativa', () => {
      expect(() => aCongregation().deactivate().markAsHeadquarters()).toThrow(
        CongregationInactiveError,
      );
    });

    it('não marca como sede quem já é sede', () => {
      expect(() =>
        aCongregation({ isHeadquarters: true }).markAsHeadquarters(),
      ).toThrow(CongregationAlreadyHeadquartersError);
    });

    it('desmarca a sede', () => {
      const demoted = aCongregation({
        isHeadquarters: true,
      }).unmarkAsHeadquarters();

      expect(demoted.isHeadquarters).toBe(false);
    });
  });
});
