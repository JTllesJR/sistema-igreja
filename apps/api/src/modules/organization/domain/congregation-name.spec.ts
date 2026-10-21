import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { CongregationName } from './congregation-name.js';

describe('CongregationName', () => {
  it('preserva a grafia original para exibição, sem espaços sobrando', () => {
    expect(CongregationName.create('  Congregação   São José ').value).toBe(
      'Congregação São José',
    );
  });

  it.each(['', '   ', 'A'])(
    'rejeita nome vazio ou curto demais: "%s"',
    (raw) => {
      const error = thrownBy(() => CongregationName.create(raw));

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ field: 'name' });
    },
  );

  it('rejeita nome com mais de 100 caracteres, mas aceita exatamente 100', () => {
    expect(() => CongregationName.create('a'.repeat(101))).toThrow(
      ValidationError,
    );
    expect(CongregationName.create('a'.repeat(100)).value).toHaveLength(100);
  });

  describe('identidade para unicidade (regra 2 do ADR 0009)', () => {
    it('ignora diferença de caixa', () => {
      expect(
        CongregationName.create('SEDE').equals(CongregationName.create('sede')),
      ).toBe(true);
    });

    it('ignora acentos', () => {
      expect(
        CongregationName.create('São Paulo').equals(
          CongregationName.create('Sao Paulo'),
        ),
      ).toBe(true);
    });

    it('ignora espaços nas pontas e repetidos', () => {
      expect(
        CongregationName.create('  Vila   Nova ').equals(
          CongregationName.create('vila nova'),
        ),
      ).toBe(true);
    });

    it('não confunde nomes realmente diferentes', () => {
      expect(
        CongregationName.create('Congregação Norte').equals(
          CongregationName.create('Congregação Sul'),
        ),
      ).toBe(false);
    });

    it('trata "ç" e "c" como a mesma letra para comparação', () => {
      expect(
        CongregationName.create('Ação').equals(CongregationName.create('Acao')),
      ).toBe(true);
    });
  });
});
