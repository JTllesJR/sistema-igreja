import { describe, expect, it } from 'vitest';
import {
  changeMemberStatusRequestSchema,
  listMembersQuerySchema,
  recordMemberEventRequestSchema,
  registerMemberRequestSchema,
  transferMemberRequestSchema,
  updateMemberRequestSchema,
} from './members.js';

const congregationId = '0199c0a4-7b3e-7c11-8f2a-000000000001';

describe('registerMemberRequestSchema', () => {
  it('só congregação e nome já bastam; o resto é opcional', () => {
    expect(
      registerMemberRequestSchema.safeParse({
        congregationId,
        fullName: 'Maria',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['sem congregação', { fullName: 'Maria' }],
    [
      'congregação que não é um UUID',
      { congregationId: '1', fullName: 'Maria' },
    ],
    ['sem nome', { congregationId }],
    [
      'situação inexistente',
      { congregationId, fullName: 'M', status: 'EM_DISCIPLINA' },
    ],
    [
      'data fora do formato',
      { congregationId, fullName: 'M', birthDate: '10/05/1990' },
    ],
    ['nome gigante', { congregationId, fullName: 'a'.repeat(301) }],
  ])('recusa %s', (_nome, corpo) => {
    expect(registerMemberRequestSchema.safeParse(corpo).success).toBe(false);
  });

  it('descarta campos que o cliente não deveria mandar (igreja, versão, anonimização)', () => {
    const result = registerMemberRequestSchema.parse({
      congregationId,
      fullName: 'Maria',
      organizationId: 'outra',
      version: 9,
      anonymizedAt: '2020-01-01',
    });

    expect(result).toEqual({ congregationId, fullName: 'Maria' });
  });
});

describe('updateMemberRequestSchema', () => {
  it('distingue "não informado" de "apagar"', () => {
    expect(updateMemberRequestSchema.parse({})).toEqual({});
    expect(
      updateMemberRequestSchema.parse({ phone: null, address: null }),
    ).toEqual({
      phone: null,
      address: null,
    });
  });

  it('não aceita mudar a congregação nem a situação por aqui (têm rota e regra próprias)', () => {
    const result = updateMemberRequestSchema.parse({
      fullName: 'Maria',
      congregationId,
      status: 'AWAY',
    });

    expect(result).toEqual({ fullName: 'Maria' });
  });
});

describe('demais pedidos', () => {
  it('situação, transferência e evento', () => {
    expect(
      changeMemberStatusRequestSchema.safeParse({ status: 'AWAY' }).success,
    ).toBe(true);
    expect(
      changeMemberStatusRequestSchema.safeParse({ status: 'X' }).success,
    ).toBe(false);
    expect(
      transferMemberRequestSchema.safeParse({ congregationId }).success,
    ).toBe(true);
    expect(
      transferMemberRequestSchema.safeParse({ congregationId: 'x' }).success,
    ).toBe(false);
    expect(
      recordMemberEventRequestSchema.safeParse({
        type: 'BAPTISM',
        occurredOn: '2010-03-14',
      }).success,
    ).toBe(true);
  });

  it('só batismo e recepção são informados à mão: os outros eventos o sistema gera', () => {
    for (const type of [
      'TRANSFER',
      'STATUS_CHANGE',
      'REGISTERED',
      'ANONYMIZED',
    ]) {
      expect(
        recordMemberEventRequestSchema.safeParse({
          type,
          occurredOn: '2010-03-14',
        }).success,
      ).toBe(false);
    }
  });
});

describe('listMembersQuerySchema', () => {
  it('converte os números que chegam como texto na URL', () => {
    expect(listMembersQuerySchema.parse({ limit: '25', offset: '50' })).toEqual(
      {
        limit: 25,
        offset: 50,
      },
    );
  });

  it.each([
    ['limite zero', { limit: '0' }],
    ['limite acima do máximo', { limit: '101' }],
    ['posição negativa', { offset: '-1' }],
    ['limite que não é número', { limit: 'muitos' }],
    ['situação inexistente', { status: 'X' }],
    ['congregação que não é UUID', { congregationId: 'x' }],
  ])('recusa %s', (_nome, query) => {
    expect(listMembersQuerySchema.safeParse(query).success).toBe(false);
  });
});
