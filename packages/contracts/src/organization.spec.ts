import { describe, expect, it } from 'vitest';
import {
  listCongregationsQuerySchema,
  registerCongregationRequestSchema,
  updateCongregationRequestSchema,
} from './organization.js';

const address = { street: 'Rua A', city: 'Recife', state: 'PE' };

describe('registerCongregationRequestSchema', () => {
  it('só o nome já basta', () => {
    expect(
      registerCongregationRequestSchema.safeParse({ name: 'Sede' }).success,
    ).toBe(true);
  });

  it('aceita endereço e horários de culto', () => {
    const result = registerCongregationRequestSchema.safeParse({
      name: 'Filial',
      address,
      serviceTimes: [{ weekday: 'SUNDAY', time: '19:00', name: 'Celebração' }],
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['sem nome', {}],
    [
      'dia da semana inventado',
      {
        name: 'X',
        serviceTimes: [{ weekday: 'DOMINGO', time: '19:00', name: 'a' }],
      },
    ],
    [
      'horário fora do formato',
      {
        name: 'X',
        serviceTimes: [{ weekday: 'SUNDAY', time: '7pm', name: 'a' }],
      },
    ],
    [
      'hora impossível',
      {
        name: 'X',
        serviceTimes: [{ weekday: 'SUNDAY', time: '24:00', name: 'a' }],
      },
    ],
    [
      'endereço sem cidade',
      { name: 'X', address: { street: 'Rua A', state: 'PE' } },
    ],
    [
      'horários demais',
      {
        name: 'X',
        serviceTimes: Array(31).fill({
          weekday: 'SUNDAY',
          time: '19:00',
          name: 'a',
        }),
      },
    ],
  ])('recusa %s', (_nome, corpo) => {
    expect(registerCongregationRequestSchema.safeParse(corpo).success).toBe(
      false,
    );
  });

  it('descarta campos desconhecidos (ex.: tentar mandar a igreja ou o status)', () => {
    const result = registerCongregationRequestSchema.parse({
      name: 'Filial',
      organizationId: 'outra',
      isHeadquarters: true,
    });
    expect(result).toEqual({ name: 'Filial' });
  });
});

describe('updateCongregationRequestSchema', () => {
  it('distingue "não informado" de "remover o endereço"', () => {
    expect(updateCongregationRequestSchema.parse({})).toEqual({});
    expect(updateCongregationRequestSchema.parse({ address: null })).toEqual({
      address: null,
    });
  });
});

describe('listCongregationsQuerySchema', () => {
  it('aceita filtro por situação e recusa valor desconhecido', () => {
    expect(listCongregationsQuerySchema.safeParse({}).success).toBe(true);
    expect(
      listCongregationsQuerySchema.safeParse({ status: 'ACTIVE' }).success,
    ).toBe(true);
    expect(
      listCongregationsQuerySchema.safeParse({ status: 'TODAS' }).success,
    ).toBe(false);
  });
});
