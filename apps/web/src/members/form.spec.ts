import type { MemberDetail, MemberHistoryEvent } from '@igreja/contracts';
import { describe, expect, it } from 'vitest';
import {
  ANONYMIZE_CONFIRMATION,
  describeEvent,
  emptyMemberForm,
  formatDate,
  formatPhone,
  fromMember,
  isAnonymizeConfirmed,
  toCreateRequest,
  toUpdateRequest,
  validateMemberForm,
  type MemberForm,
} from './form';

const filled = (): MemberForm => ({
  congregationId: 'c1',
  fullName: '  Maria   da Silva ',
  birthDate: '1990-05-10',
  phone: '(81) 99999-8888',
  email: ' Maria@Exemplo.com ',
  address: {
    street: ' Rua das Flores ',
    number: '100',
    complement: '  ',
    district: '',
    city: 'Recife',
    state: 'pe',
    postalCode: '',
  },
});

describe('validateMemberForm', () => {
  it('só o nome (e a congregação, no cadastro) são obrigatórios', () => {
    expect(
      validateMemberForm(emptyMemberForm(), { requireCongregation: true }),
    ).toEqual({
      congregationId: 'Escolha a congregação.',
      fullName: 'Informe o nome completo.',
    });
    expect(
      validateMemberForm(emptyMemberForm(), { requireCongregation: false }),
    ).toEqual({
      fullName: 'Informe o nome completo.',
    });
  });

  it('formulário completo não tem erros', () => {
    expect(validateMemberForm(filled(), { requireCongregation: true })).toEqual(
      {},
    );
  });

  it('telefone e e-mail só são validados se preenchidos', () => {
    const form = { ...filled(), phone: '123', email: 'sem-arroba' };

    expect(validateMemberForm(form, { requireCongregation: true })).toEqual({
      phone: 'Informe o telefone com DDD (ex.: (81) 99999-8888).',
      email: 'Informe um e-mail válido.',
    });
  });

  it('qualquer campo de endereço preenchido exige rua, cidade e estado, com a chave da API', () => {
    const form = emptyMemberForm('c1');
    form.fullName = 'Maria';
    form.address.district = 'Centro';

    expect(validateMemberForm(form, { requireCongregation: true })).toEqual({
      'address.street': 'Informe a rua.',
      'address.city': 'Informe a cidade.',
      'address.state': 'Escolha o estado.',
    });
  });
});

describe('conversão para a API', () => {
  it('cadastro: apara, campo vazio vira null e UF em maiúsculas', () => {
    expect(toCreateRequest(filled())).toEqual({
      congregationId: 'c1',
      fullName: 'Maria   da Silva',
      birthDate: '1990-05-10',
      phone: '(81) 99999-8888',
      email: 'Maria@Exemplo.com',
      address: {
        street: 'Rua das Flores',
        number: '100',
        complement: null,
        district: null,
        city: 'Recife',
        state: 'PE',
        postalCode: null,
      },
    });
  });

  it('edição NÃO leva a congregação (a mudança é pela transferência) e vazio apaga', () => {
    const request = toUpdateRequest({
      ...emptyMemberForm('c1'),
      fullName: 'Maria',
    });

    expect(request).toEqual({
      fullName: 'Maria',
      birthDate: null,
      phone: null,
      email: null,
      address: null,
    });
    expect(request).not.toHaveProperty('congregationId');
  });

  it('ida e volta: ficha -> formulário -> pedido de edição mantém os dados', () => {
    const detail: MemberDetail = {
      id: 'm1',
      fullName: 'Maria da Silva',
      congregationId: 'c1',
      status: 'ACTIVE',
      birthDate: '1990-05-10',
      phone: '81999998888',
      email: 'maria@exemplo.com',
      address: {
        street: 'Rua A',
        number: null,
        complement: null,
        district: null,
        city: 'Recife',
        state: 'PE',
        postalCode: null,
      },
      position: 'MEMBER',
      anonymized: false,
      capabilities: { canEdit: true, canAnonymize: false },
      history: [],
    };

    expect(toUpdateRequest(fromMember(detail))).toEqual({
      fullName: 'Maria da Silva',
      birthDate: '1990-05-10',
      phone: '81999998888',
      email: 'maria@exemplo.com',
      address: detail.address,
    });
  });
});

describe('formatação', () => {
  it('datas não passam por Date: o dia nunca escorrega', () => {
    expect(formatDate('1990-05-10')).toBe('10/05/1990');
    expect(formatDate('2000-01-01')).toBe('01/01/2000');
    expect(formatDate(null)).toBe('—');
  });

  it.each([
    ['81999998888', '(81) 99999-8888'],
    ['8133334444', '(81) 3333-4444'],
    ['123', '123'],
  ])('telefone %s -> %s', (digits, expected) => {
    expect(formatPhone(digits)).toBe(expected);
  });
  it('telefone ausente', () => {
    expect(formatPhone(null)).toBe('—');
  });
});

describe('describeEvent', () => {
  const base: MemberHistoryEvent = {
    id: 'e1',
    type: 'BAPTISM',
    occurredOn: '2010-03-14',
    notes: null,
    fromCongregationId: null,
    toCongregationId: null,
    fromStatus: null,
    toStatus: null,
    recordedAt: '2026-10-20T12:00:00.000Z',
  };
  const name = (id: string | null) =>
    id === 'c1' ? 'Sede' : id === 'c2' ? 'Filial' : 'outra congregação';

  it('transferência e mudança de situação dizem de onde para onde', () => {
    expect(
      describeEvent(
        {
          ...base,
          type: 'TRANSFER',
          fromCongregationId: 'c1',
          toCongregationId: 'c2',
        },
        name,
      ),
    ).toBe('Transferência de Sede para Filial');
    expect(
      describeEvent(
        {
          ...base,
          type: 'STATUS_CHANGE',
          fromStatus: 'ACTIVE',
          toStatus: 'AWAY',
        },
        name,
      ),
    ).toBe('Situação: Ativo → Afastado');
  });

  it('congregação desconhecida (sem permissão de ler a lista) não quebra', () => {
    expect(
      describeEvent(
        { ...base, type: 'REGISTERED', toCongregationId: 'zzz' },
        name,
      ),
    ).toBe('Cadastrado em outra congregação');
  });

  it('batismo e anonimização usam o rótulo', () => {
    expect(describeEvent(base, name)).toBe('Batismo');
    expect(describeEvent({ ...base, type: 'ANONYMIZED' }, name)).toBe(
      'Dados anonimizados',
    );
  });
});

describe('confirmação da anonimização (irreversível)', () => {
  it('só vale o texto exato (aparando espaços), sem diferenciar nada além disso', () => {
    expect(isAnonymizeConfirmed(ANONYMIZE_CONFIRMATION)).toBe(true);
    expect(isAnonymizeConfirmed('  ANONIMIZAR ')).toBe(true);
    for (const typed of ['', 'anonimizar', 'ANONIMIZA', 'sim', 'ANONIMIZAR!']) {
      expect(isAnonymizeConfirmed(typed)).toBe(false);
    }
  });
});
