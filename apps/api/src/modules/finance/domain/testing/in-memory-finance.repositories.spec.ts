import { describeFinanceRepositoriesContract } from './finance-repositories.contract.js';
import {
  InMemoryAccountRepository,
  InMemoryCategoryRepository,
  InMemoryEntryRepository,
} from './in-memory-finance.repositories.js';

// O fake que os testes dos casos de uso usam cumpre o MESMO contrato do repositório de verdade.
describeFinanceRepositoriesContract('em memória', () =>
  Promise.resolve({
    accounts: new InMemoryAccountRepository(),
    categories: new InMemoryCategoryRepository(),
    entries: new InMemoryEntryRepository(),
  }),
);
