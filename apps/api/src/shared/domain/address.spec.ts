import { describe, expect, it } from 'vitest';
import { ValidationError } from './domain-error.js';
import { thrownBy } from '../testing/thrown-by.js';
import { Address } from './address.js';

const minimal = { street: 'Rua das Flores', city: 'Campinas', state: 'SP' };

describe('Address', () => {
  it('cria com o mínimo (rua, cidade e UF); o resto fica nulo', () => {
    expect(Address.create(minimal).toPrimitives()).toEqual({
      street: 'Rua das Flores',
      number: null,
      complement: null,
      district: null,
      city: 'Campinas',
      state: 'SP',
      postalCode: null,
    });
  });

  it('guarda todos os campos quando informados', () => {
    const address = Address.create({
      ...minimal,
      number: '120',
      complement: 'Fundos',
      district: 'Centro',
      postalCode: '13015904',
    });

    expect(address.toPrimitives()).toMatchObject({
      number: '120',
      complement: 'Fundos',
      district: 'Centro',
      postalCode: '13015904',
    });
  });

  it('normaliza a UF para maiúsculas', () => {
    expect(
      Address.create({ ...minimal, state: 'sp' }).toPrimitives().state,
    ).toBe('SP');
  });

  it('normaliza o CEP para 8 dígitos, sem hífen', () => {
    expect(
      Address.create({ ...minimal, postalCode: '13015-904' }).toPrimitives()
        .postalCode,
    ).toBe('13015904');
  });

  it('remove espaços e trata texto opcional vazio como ausente', () => {
    const primitives = Address.create({
      ...minimal,
      street: '  Rua das Flores ',
      number: '   ',
      complement: '',
    }).toPrimitives();

    expect(primitives.street).toBe('Rua das Flores');
    expect(primitives.number).toBeNull();
    expect(primitives.complement).toBeNull();
  });

  it.each([
    ['rua vazia', { street: ' ' }, 'street'],
    ['cidade vazia', { city: '' }, 'city'],
    ['UF inexistente', { state: 'XX' }, 'state'],
    ['UF com tamanho errado', { state: 'SPP' }, 'state'],
    ['CEP curto', { postalCode: '123' }, 'postalCode'],
    ['CEP com letras', { postalCode: '1301590A' }, 'postalCode'],
  ])('rejeita %s', (_caso, override, field) => {
    const error = thrownBy(() => Address.create({ ...minimal, ...override }));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field });
  });

  it('reconstrói um endereço igual a partir dos primitivos (ida e volta para o banco)', () => {
    const original = Address.create({
      ...minimal,
      number: '120',
      postalCode: '13015-904',
    });

    const restored = Address.fromPrimitives(original.toPrimitives());

    expect(restored.equals(original)).toBe(true);
  });

  it('compara por valor', () => {
    expect(Address.create(minimal).equals(Address.create({ ...minimal }))).toBe(
      true,
    );
    expect(
      Address.create(minimal).equals(
        Address.create({ ...minimal, city: 'Sumaré' }),
      ),
    ).toBe(false);
  });
});
