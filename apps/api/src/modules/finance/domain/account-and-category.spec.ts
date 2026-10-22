import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { DEFAULT_CATEGORIES, FinanceCategory } from './finance-category.js';
import { FinancialAccount } from './financial-account.js';
import { accountId, categoryId, congId, orgId } from './testing/fixtures.js';

const register = (name: string) =>
  FinancialAccount.register({
    id: accountId(1),
    organizationId: orgId(),
    congregationId: congId(1),
    name,
    kind: 'CASH',
  });

describe('FinancialAccount', () => {
  it('nasce ativa, com o nome aparado', () => {
    const account = register('  Caixa   da  tesouraria ');

    expect(account).toMatchObject({
      name: 'Caixa da tesouraria',
      status: 'ACTIVE',
      isActive: true,
      version: 0,
      kind: 'CASH',
    });
  });

  it.each(['', '   ', 'a'.repeat(81), 'a\u0000b'])('recusa nome %j', (name) => {
    expect(thrownBy(() => register(name))).toBeInstanceOf(ValidationError);
  });

  it('renomeia, arquiva e reativa', () => {
    const account = register('Caixa');

    account.rename('Caixa geral');
    account.archive();
    expect(account).toMatchObject({
      name: 'Caixa geral',
      status: 'ARCHIVED',
      isActive: false,
    });

    account.unarchive();
    expect(account.isActive).toBe(true);
    expect(thrownBy(() => account.rename(' '))).toBeInstanceOf(ValidationError);
  });
});

describe('FinanceCategory', () => {
  const category = () =>
    FinanceCategory.register({
      id: categoryId(1),
      organizationId: orgId(),
      name: ' Dízimo ',
      direction: 'IN',
    });

  it('nasce ativa, com sentido fixo', () => {
    expect(category()).toMatchObject({
      name: 'Dízimo',
      direction: 'IN',
      status: 'ACTIVE',
    });
  });

  it('renomeia e arquiva', () => {
    const c = category();

    c.rename('Dízimos');
    c.archive();

    expect(c).toMatchObject({
      name: 'Dízimos',
      status: 'ARCHIVED',
      direction: 'IN',
    });
  });

  it('as categorias padrão cobrem entradas e saídas, sem repetir nome dentro do sentido', () => {
    const ins = DEFAULT_CATEGORIES.filter((c) => c.direction === 'IN').map(
      (c) => c.name,
    );
    const outs = DEFAULT_CATEGORIES.filter((c) => c.direction === 'OUT').map(
      (c) => c.name,
    );

    expect(ins).toEqual(
      expect.arrayContaining([
        'Dízimo',
        'Oferta',
        'Contribuição específica',
        'Doação',
      ]),
    );
    expect(outs.length).toBeGreaterThan(3);
    expect(new Set(ins).size).toBe(ins.length);
    expect(new Set(outs).size).toBe(outs.length);
  });
});
