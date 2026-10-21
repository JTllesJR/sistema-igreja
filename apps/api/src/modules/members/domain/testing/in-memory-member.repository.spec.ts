import { describeMemberRepositoryContract } from './member-repository.contract.js';
import { InMemoryMemberRepository } from './in-memory-member.repository.js';

// O fake que os testes dos casos de uso usam cumpre o MESMO contrato do repositório de verdade.
describeMemberRepositoryContract('em memória', () =>
  Promise.resolve(new InMemoryMemberRepository()),
);
