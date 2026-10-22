import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRY_CENTS,
  createAccountRequestSchema,
  dashboardQuerySchema,
  listAccountsQuerySchema,
  listEntriesQuerySchema,
  recordIncomeRequestSchema,
  rejectEntryRequestSchema,
  requestTransferRequestSchema,
  searchContributorsQuerySchema,
} from './finance.js';

const id = '0199c0a4-7b3e-7c11-8f2a-000000000001';
const other = '0199c0a4-7b3e-7c11-8f2a-000000000002';

describe('recordIncomeRequestSchema', () => {
  const valid = {
    accountId: id,
    categoryId: other,
    amountCents: 10_000,
    occurredOn: '2026-10-20',
  };

  it('conta, categoria, valor e data bastam; o resto é opcional (dízimo anônimo)', () => {
    expect(recordIncomeRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      recordIncomeRequestSchema.safeParse({ ...valid, memberId: other })
        .success,
    ).toBe(true);
  });

  it.each([
    ['valor zero', { amountCents: 0 }],
    ['valor negativo', { amountCents: -1 }],
    ['valor decimal (centavos são inteiros)', { amountCents: 10.5 }],
    ['valor acima do teto', { amountCents: MAX_ENTRY_CENTS + 1 }],
    ['valor em texto', { amountCents: '100' }],
    ['data fora do formato', { occurredOn: '20/10/2026' }],
    ['conta que não é UUID', { accountId: '1' }],
    ['membro que não é UUID', { memberId: 'maria' }],
    ['descrição gigante', { description: 'a'.repeat(301) }],
  ])('recusa %s', (_nome, mudanca) => {
    expect(
      recordIncomeRequestSchema.safeParse({ ...valid, ...mudanca }).success,
    ).toBe(false);
  });

  it('o teto exato é aceito', () => {
    expect(
      recordIncomeRequestSchema.safeParse({
        ...valid,
        amountCents: MAX_ENTRY_CENTS,
      }).success,
    ).toBe(true);
  });
});

describe('demais pedidos', () => {
  it('conta exige tipo válido', () => {
    const base = { congregationId: id, name: 'Caixa' };

    expect(
      createAccountRequestSchema.safeParse({ ...base, kind: 'BANK' }).success,
    ).toBe(true);
    expect(
      createAccountRequestSchema.safeParse({ ...base, kind: 'OURO' }).success,
    ).toBe(false);
  });

  it('repasse exige as duas contas', () => {
    const base = { amountCents: 100, occurredOn: '2026-10-20' };

    expect(
      requestTransferRequestSchema.safeParse({
        ...base,
        fromAccountId: id,
        toAccountId: other,
      }).success,
    ).toBe(true);
    expect(
      requestTransferRequestSchema.safeParse({ ...base, fromAccountId: id })
        .success,
    ).toBe(false);
  });

  it('recusa leva o motivo', () => {
    expect(
      rejectEntryRequestSchema.safeParse({ note: 'sem nota' }).success,
    ).toBe(true);
    expect(rejectEntryRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('parâmetros de URL (chegam como texto)', () => {
  it('converte booleanos e números', () => {
    expect(listAccountsQuerySchema.parse({ includeArchived: 'true' })).toEqual({
      includeArchived: true,
    });
    expect(
      listEntriesQuerySchema.parse({
        limit: '20',
        offset: '40',
        status: 'PENDING',
      }),
    ).toEqual({ limit: 20, offset: 40, status: 'PENDING' });
  });

  it.each([
    [
      'booleano inventado',
      listAccountsQuerySchema,
      { includeArchived: 'talvez' },
    ],
    ['situação inexistente', listEntriesQuerySchema, { status: 'LIDO' }],
    ['limite acima do máximo', listEntriesQuerySchema, { limit: '101' }],
    ['posição negativa', listEntriesQuerySchema, { offset: '-1' }],
    ['período mal formatado', dashboardQuerySchema, { from: 'ontem' }],
    ['busca vazia de campo', searchContributorsQuerySchema, {}],
    [
      'busca gigante',
      searchContributorsQuerySchema,
      { search: 'a'.repeat(101) },
    ],
  ])('recusa %s', (_nome, schema, query) => {
    expect(schema.safeParse(query).success).toBe(false);
  });
});
