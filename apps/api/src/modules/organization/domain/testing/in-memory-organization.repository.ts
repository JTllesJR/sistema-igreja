import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import {
  OrganizationAlreadyExistsError,
  OrganizationNotFoundError,
} from '../errors.js';
import type { OrganizationId } from '../ids.js';
import { Organization } from '../organization.js';
import type { OrganizationRepository } from '../organization.repository.js';

/**
 * Repositório em memória para testes. Imita o comportamento do banco que importa para os casos de uso:
 * guarda e devolve CÓPIAS (não compartilha objetos mutáveis) e aplica o travamento otimista por versão.
 */
export class InMemoryOrganizationRepository implements OrganizationRepository {
  readonly #store = new Map<string, Organization>();

  /** Quantas organizações estão guardadas (útil para afirmar que "nada foi persistido"). */
  get size(): number {
    return this.#store.size;
  }

  findById(id: OrganizationId): Promise<Organization | null> {
    const stored = this.#store.get(id);
    return Promise.resolve(stored ? copyOf(stored, stored.version) : null);
  }

  add(organization: Organization): Promise<void> {
    if (this.#store.has(organization.id)) {
      return Promise.reject(
        new OrganizationAlreadyExistsError(organization.id),
      );
    }
    this.#store.set(
      organization.id,
      copyOf(organization, organization.version),
    );
    return Promise.resolve();
  }

  save(organization: Organization): Promise<void> {
    const stored = this.#store.get(organization.id);
    if (!stored) {
      return Promise.reject(new OrganizationNotFoundError(organization.id));
    }
    if (stored.version !== organization.version) {
      return Promise.reject(new ConcurrencyConflictError());
    }
    this.#store.set(
      organization.id,
      copyOf(organization, organization.version + 1),
    );
    return Promise.resolve();
  }
}

function copyOf(organization: Organization, version: number): Organization {
  return Organization.restore({
    id: organization.id,
    name: organization.name,
    version,
    congregations: organization.congregations,
  });
}
