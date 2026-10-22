import { describeAuditQueryContract } from './audit-query.contract.js';
import { InMemoryAuditQueryRepository } from './in-memory-audit-query.repository.js';

// O fake que os testes dos casos de uso usam cumpre o MESMO contrato do repositório de verdade.
describeAuditQueryContract('em memória', () => {
  const repository = new InMemoryAuditQueryRepository();
  return Promise.resolve({
    repository,
    seed: (records) => {
      repository.seed(...records);
      return Promise.resolve();
    },
  });
});
