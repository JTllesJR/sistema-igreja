import { ValidationError } from '../../../shared/domain/domain-error.js';
import type { Address } from './address.js';
import { Congregation } from './congregation.js';
import type { CongregationName } from './congregation-name.js';
import {
  CongregationNameAlreadyInUseError,
  CongregationNotFoundError,
  OrganizationStateCorruptedError,
} from './errors.js';
import type { CongregationId, OrganizationId } from './ids.js';
import type { OrganizationName } from './organization-name.js';
import type { ServiceTime } from './service-time.js';

export interface CongregationChanges {
  name?: CongregationName;
  /** `null` remove o endereço; `undefined` mantém o atual. */
  address?: Address | null;
  serviceTimes?: readonly ServiceTime[];
}

/**
 * Raiz do agregado: a igreja e todas as suas congregações (ADR 0009).
 *
 * É ela que garante o que depende do CONJUNTO de congregações:
 *  1. há exatamente uma sede, e ela está ativa;
 *  2. o nome da congregação é único na igreja (caixa, acentos e espaços não contam; inativas também reservam o nome).
 *
 * Toda operação é atômica: se lançar erro, o estado permanece exatamente como estava. Para isso, cada método
 * calcula o resultado completo antes de trocar o estado interno.
 */
export class Organization {
  #name: OrganizationName;
  #congregations: readonly Congregation[];

  private constructor(
    readonly id: OrganizationId,
    name: OrganizationName,
    /** Contador de travamento otimista, mantido pelo repositório ao gravar; o domínio apenas o carrega. */
    readonly version: number,
    congregations: readonly Congregation[],
  ) {
    this.#name = name;
    this.#congregations = congregations;
  }

  /** Uma igreja nova já nasce com sua sede: nunca existe estado sem sede. */
  static create(input: {
    id: OrganizationId;
    name: OrganizationName;
    headquarters: {
      id: CongregationId;
      name: CongregationName;
      address?: Address | null;
      serviceTimes?: readonly ServiceTime[];
    };
  }): Organization {
    const headquarters = Congregation.create({
      ...input.headquarters,
      isHeadquarters: true,
    });
    return new Organization(input.id, input.name, 0, [headquarters]);
  }

  /** Reconstrói a partir do que foi gravado, revalidando as invariantes: dado corrompido não passa em silêncio. */
  static restore(input: {
    id: OrganizationId;
    name: OrganizationName;
    version: number;
    congregations: readonly Congregation[];
  }): Organization {
    assertConsistent(input.congregations);
    return new Organization(input.id, input.name, input.version, [
      ...input.congregations,
    ]);
  }

  get name(): OrganizationName {
    return this.#name;
  }

  /** Cópia: quem recebe não consegue alterar a lista interna. */
  get congregations(): readonly Congregation[] {
    return [...this.#congregations];
  }

  get headquarters(): Congregation {
    const headquarters = this.#congregations.find((c) => c.isHeadquarters);
    if (!headquarters) {
      throw new OrganizationStateCorruptedError('nenhuma sede encontrada.');
    }
    return headquarters;
  }

  findCongregation(id: CongregationId): Congregation | undefined {
    return this.#congregations.find((c) => c.id === id);
  }

  rename(name: OrganizationName): void {
    this.#name = name;
  }

  registerCongregation(input: {
    id: CongregationId;
    name: CongregationName;
    address?: Address | null;
    serviceTimes?: readonly ServiceTime[];
  }): Congregation {
    if (this.findCongregation(input.id)) {
      throw new ValidationError(
        'id',
        'Já existe uma congregação com este identificador.',
      );
    }
    this.assertNameAvailable(input.name);

    const congregation = Congregation.create(input);
    this.#congregations = [...this.#congregations, congregation];
    return congregation;
  }

  updateCongregation(
    id: CongregationId,
    changes: CongregationChanges,
  ): Congregation {
    let updated = this.require(id);

    if (changes.name !== undefined) {
      this.assertNameAvailable(changes.name, id);
      updated = updated.rename(changes.name);
    }
    if (changes.address !== undefined) {
      updated = updated.changeAddress(changes.address);
    }
    if (changes.serviceTimes !== undefined) {
      updated = updated.changeServiceTimes(changes.serviceTimes);
    }

    this.replace(updated);
    return updated;
  }

  deactivateCongregation(id: CongregationId): Congregation {
    const updated = this.require(id).deactivate();
    this.replace(updated);
    return updated;
  }

  reactivateCongregation(id: CongregationId): Congregation {
    const updated = this.require(id).reactivate();
    this.replace(updated);
    return updated;
  }

  /**
   * Troca a sede de uma vez só: a antiga deixa de ser e a nova passa a ser, sem estado intermediário.
   * `markAsHeadquarters` valida (ativa, não é sede) ANTES de qualquer troca, o que preserva a atomicidade.
   */
  designateHeadquarters(id: CongregationId): Congregation {
    const newHeadquarters = this.require(id).markAsHeadquarters();
    const previous = this.headquarters;

    this.#congregations = this.#congregations.map((c) => {
      if (c.id === previous.id) return previous.unmarkAsHeadquarters();
      if (c.id === id) return newHeadquarters;
      return c;
    });
    return newHeadquarters;
  }

  private require(id: CongregationId): Congregation {
    const congregation = this.findCongregation(id);
    if (!congregation) throw new CongregationNotFoundError(id);
    return congregation;
  }

  private replace(updated: Congregation): void {
    this.#congregations = this.#congregations.map((c) =>
      c.id === updated.id ? updated : c,
    );
  }

  /** `exceptId` permite a uma congregação manter (ou ajustar a grafia de) o próprio nome. */
  private assertNameAvailable(
    name: CongregationName,
    exceptId?: CongregationId,
  ): void {
    const taken = this.#congregations.some(
      (c) => c.id !== exceptId && c.name.equals(name),
    );
    if (taken) throw new CongregationNameAlreadyInUseError(name.value);
  }
}

function assertConsistent(congregations: readonly Congregation[]): void {
  const headquarters = congregations.filter((c) => c.isHeadquarters);

  if (headquarters.length !== 1) {
    throw new OrganizationStateCorruptedError(
      `esperada exatamente 1 sede, encontradas ${headquarters.length}.`,
    );
  }
  if (headquarters[0]?.status !== 'ACTIVE') {
    throw new OrganizationStateCorruptedError('a sede está inativa.');
  }

  congregations.forEach((congregation, index) => {
    for (const other of congregations.slice(index + 1)) {
      if (congregation.id === other.id) {
        throw new OrganizationStateCorruptedError(
          'identificador de congregação repetido.',
        );
      }
      if (congregation.name.equals(other.name)) {
        throw new OrganizationStateCorruptedError(
          `nome de congregação repetido: "${congregation.name.value}".`,
        );
      }
    }
  });
}
