import type { Congregation, CurrentUser } from '@igreja/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../auth/http';
import {
  canManageOrganization,
  describeApiError,
  describeServiceTime,
  emptyForm,
  fromCongregation,
  hasAddress,
  newServiceTime,
  summarizeAddress,
  toRequest,
  validateForm,
  type CongregationForm,
} from './form';

const filled = (): CongregationForm => ({
  name: '  Filial   Norte ',
  address: {
    street: ' Rua das Flores ',
    number: '100',
    complement: '  ',
    district: 'Centro',
    city: 'Recife',
    state: 'pe',
    postalCode: '50000-000',
  },
  serviceTimes: [{ weekday: 'SUNDAY', time: '19:00', name: ' Celebração ' }],
});

describe('validateForm', () => {
  it('formulário vazio: só o nome é exigido (endereço e cultos são opcionais)', () => {
    expect(validateForm(emptyForm())).toEqual({
      name: 'Informe o nome da congregação.',
    });
  });

  it('formulário completo não tem erros', () => {
    expect(validateForm(filled())).toEqual({});
  });

  it('qualquer campo de endereço preenchido exige rua, cidade e estado', () => {
    const form = emptyForm();
    form.name = 'X';
    form.address.district = 'Centro';

    expect(validateForm(form)).toEqual({
      'address.street': 'Informe a rua.',
      'address.city': 'Informe a cidade.',
      'address.state': 'Escolha o estado.',
    });
  });

  it('cada culto exige horário HH:mm e nome, com a chave do campo igual à da API', () => {
    const form = emptyForm();
    form.name = 'X';
    form.serviceTimes = [
      newServiceTime(),
      { weekday: 'FRIDAY', time: '25:00', name: 'ok' },
      { weekday: 'FRIDAY', time: '19:30', name: 'ok' },
    ];

    expect(validateForm(form)).toEqual({
      'serviceTimes.0.time': 'Informe o horário (ex.: 19:00).',
      'serviceTimes.0.name': 'Dê um nome ao culto.',
      'serviceTimes.1.time': 'Informe o horário (ex.: 19:00).',
    });
  });
});

describe('toRequest', () => {
  it('apara textos, troca campo vazio por null e põe a UF em maiúsculas', () => {
    expect(toRequest(filled())).toEqual({
      name: 'Filial   Norte',
      address: {
        street: 'Rua das Flores',
        number: '100',
        complement: null,
        district: 'Centro',
        city: 'Recife',
        state: 'PE',
        postalCode: '50000-000',
      },
      serviceTimes: [{ weekday: 'SUNDAY', time: '19:00', name: 'Celebração' }],
    });
  });

  it('sem nenhum campo de endereço, envia address: null (na edição, isso remove o endereço)', () => {
    const form = filled();
    form.address = emptyForm().address;

    expect(toRequest(form).address).toBeNull();
  });

  it('endereço só com espaços não conta como endereço', () => {
    const form = emptyForm();
    form.address.street = '   ';

    expect(hasAddress(form.address)).toBe(false);
    expect(toRequest({ ...form, name: 'X' }).address).toBeNull();
  });
});

describe('fromCongregation (editar)', () => {
  const congregation: Congregation = {
    id: 'c1',
    name: 'Sede',
    isHeadquarters: true,
    status: 'ACTIVE',
    address: {
      street: 'Rua A',
      number: null,
      complement: null,
      district: 'Centro',
      city: 'Recife',
      state: 'PE',
      postalCode: null,
    },
    serviceTimes: [{ weekday: 'SUNDAY', time: '19:00', name: 'Culto' }],
  };

  it('null vira texto vazio, e o formulário volta ao mesmo pedido (ida e volta)', () => {
    const form = fromCongregation(congregation);

    expect(form.address.number).toBe('');
    expect(toRequest(form)).toEqual({
      name: 'Sede',
      address: congregation.address,
      serviceTimes: congregation.serviceTimes,
    });
  });

  it('congregação sem endereço dá formulário de endereço vazio', () => {
    const form = fromCongregation({ ...congregation, address: null });

    expect(hasAddress(form.address)).toBe(false);
  });

  it('copia os cultos: editar o formulário não altera o dado original', () => {
    const form = fromCongregation(congregation);
    form.serviceTimes[0]!.name = 'Alterado';

    expect(congregation.serviceTimes[0]!.name).toBe('Culto');
  });
});

describe('textos de exibição', () => {
  it('resume o endereço, com ou sem número e bairro', () => {
    expect(
      summarizeAddress({
        street: 'Rua das Flores',
        number: '100',
        complement: null,
        district: 'Centro',
        city: 'Recife',
        state: 'PE',
        postalCode: null,
      }),
    ).toBe('Rua das Flores, 100 · Centro · Recife/PE');
    expect(
      summarizeAddress({
        street: 'Rua B',
        number: null,
        complement: null,
        district: null,
        city: 'Olinda',
        state: 'PE',
        postalCode: null,
      }),
    ).toBe('Rua B · Olinda/PE');
    expect(summarizeAddress(null)).toBe('Endereço não informado');
  });

  it('descreve o horário de culto em português', () => {
    expect(
      describeServiceTime({
        weekday: 'WEDNESDAY',
        time: '19:30',
        name: 'Oração',
      }),
    ).toBe('Quarta-feira às 19:30 · Oração');
  });
});

describe('describeApiError', () => {
  it('entrada malformada: mensagem geral e erros por campo (o primeiro de cada campo)', () => {
    const error = new ApiError(400, 'http.400', 'A requisição é inválida.', [
      { path: 'serviceTimes.0.time', message: 'Use o formato HH:mm.' },
      { path: 'serviceTimes.0.time', message: 'outra' },
    ]);

    expect(describeApiError(error)).toEqual({
      summary: 'Corrija os campos destacados e tente de novo.',
      fields: { 'serviceTimes.0.time': 'Use o formato HH:mm.' },
    });
  });

  it('regra de negócio: só a mensagem do servidor, sem campos', () => {
    const error = new ApiError(
      409,
      'organization.congregation_name_taken',
      'Já existe uma congregação com este nome.',
    );

    expect(describeApiError(error)).toEqual({
      summary: 'Já existe uma congregação com este nome.',
      fields: {},
    });
  });
});

describe('canManageOrganization', () => {
  const user = (roles: CurrentUser['roles']): CurrentUser => ({
    id: 'u',
    organizationId: 'o',
    email: 'a@b.com',
    roles,
  });
  const role = (permissions: string[], congregationId: string | null) => ({
    roleId: 'r',
    roleName: 'Papel',
    isSystem: false,
    permissions,
    congregationId,
  });

  it('quem tem organization:manage na igreja toda, inclusive pelo curinga', () => {
    expect(canManageOrganization(user([role(['*'], null)]))).toBe(true);
    expect(
      canManageOrganization(user([role(['organization:manage'], null)])),
    ).toBe(true);
  });

  it.each([
    ['sem papéis', []],
    ['só leitura', [role(['organization:read'], null)]],
    ['gestão de uma congregação só', [role(['organization:manage'], 'c1')]],
  ])('não: %s', (_nome, roles) => {
    expect(canManageOrganization(user(roles))).toBe(false);
  });
});
