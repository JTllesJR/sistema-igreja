import { InMemoryOrganizationRepository } from './in-memory-organization.repository.js';
import { describeOrganizationRepositoryContract } from './organization-repository.contract.js';

describeOrganizationRepositoryContract(
  'em memória',
  () => new InMemoryOrganizationRepository(),
);
