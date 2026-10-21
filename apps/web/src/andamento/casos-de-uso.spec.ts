import { describe, expect, it } from 'vitest';
import {
  agruparPorModulo,
  casosDeUso,
  resumir,
  type CasoDeUso,
} from './casos-de-uso';

const caso = (
  id: string,
  modulo: string,
  status: CasoDeUso['status'],
): CasoDeUso => ({
  id,
  titulo: id,
  modulo,
  status,
});

describe('resumir', () => {
  it('conta cada status e calcula o percentual concluído arredondado', () => {
    // Quantidades diferentes por status: com uma de cada, trocar um filtro por outro passaria despercebido.
    const resumo = resumir([
      caso('a', 'M', 'concluido'),
      caso('b', 'M', 'concluido'),
      caso('c', 'M', 'backend'),
      caso('d', 'M', 'planejado'),
      caso('e', 'M', 'planejado'),
      caso('f', 'M', 'planejado'),
    ]);
    expect(resumo).toEqual({
      total: 6,
      concluidos: 2,
      backend: 1,
      planejados: 3,
      percentualConcluido: 33,
    });
  });

  it('lista vazia não divide por zero', () => {
    expect(resumir([]).percentualConcluido).toBe(0);
  });
});

describe('agruparPorModulo', () => {
  it('mantém a ordem de primeira aparição dos módulos', () => {
    const grupos = agruparPorModulo([
      caso('1', 'B', 'planejado'),
      caso('2', 'A', 'planejado'),
      caso('3', 'B', 'planejado'),
    ]);
    expect(grupos.map(([modulo, itens]) => [modulo, itens.length])).toEqual([
      ['B', 2],
      ['A', 1],
    ]);
  });
});

describe('dados reais', () => {
  it('não repete ids de casos de uso', () => {
    const ids = casosDeUso.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
