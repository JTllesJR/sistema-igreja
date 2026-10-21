import { InMemoryRoleRepository } from './in-memory-role.repository.js';
import { InMemorySessionRepository } from './in-memory-session.repository.js';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { describeRoleRepositoryContract } from './role-repository.contract.js';
import { describeSessionRepositoryContract } from './session-repository.contract.js';
import { describeUserRepositoryContract } from './user-repository.contract.js';

describeUserRepositoryContract(
  'em memória',
  () => new InMemoryUserRepository(),
);
describeRoleRepositoryContract(
  'em memória',
  () => new InMemoryRoleRepository(),
);
describeSessionRepositoryContract(
  'em memória',
  () => new InMemorySessionRepository(),
);
