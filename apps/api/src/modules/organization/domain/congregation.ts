import { ValidationError } from '../../../shared/domain/domain-error.js';
import type { Address } from './address.js';
import type { CongregationName } from './congregation-name.js';
import {
  CannotDeactivateHeadquartersError,
  CongregationAlreadyHeadquartersError,
  CongregationAlreadyInStatusError,
  CongregationInactiveError,
} from './errors.js';
import type { CongregationId } from './ids.js';
import type { ServiceTime } from './service-time.js';

export type CongregationStatus = 'ACTIVE' | 'INACTIVE';

export interface CongregationProps {
  id: CongregationId;
  name: CongregationName;
  isHeadquarters: boolean;
  status: CongregationStatus;
  address: Address | null;
  serviceTimes: readonly ServiceTime[];
}

/**
 * Congregação: parte do agregado `Organization`. É **imutável**: cada mudança devolve uma nova instância.
 * Só a raiz decide o que acontece no conjunto (sede única, nomes únicos); aqui ficam as regras que olham
 * apenas para esta congregação.
 */
export class Congregation {
  private constructor(private readonly props: CongregationProps) {}

  /** Uma congregação nova nasce ativa. `isHeadquarters` só é verdadeiro quando a raiz assim decide. */
  static create(input: {
    id: CongregationId;
    name: CongregationName;
    isHeadquarters?: boolean;
    address?: Address | null;
    serviceTimes?: readonly ServiceTime[];
  }): Congregation {
    return Congregation.restore({
      id: input.id,
      name: input.name,
      isHeadquarters: input.isHeadquarters ?? false,
      status: 'ACTIVE',
      address: input.address ?? null,
      serviceTimes: input.serviceTimes ?? [],
    });
  }

  /** Reconstrói a partir do que foi gravado, mantendo as regras da própria congregação. */
  static restore(props: CongregationProps): Congregation {
    assertNoSlotClash(props.serviceTimes);
    return new Congregation({
      ...props,
      serviceTimes: Object.freeze([...props.serviceTimes]),
    });
  }

  get id(): CongregationId {
    return this.props.id;
  }
  get name(): CongregationName {
    return this.props.name;
  }
  get isHeadquarters(): boolean {
    return this.props.isHeadquarters;
  }
  get status(): CongregationStatus {
    return this.props.status;
  }
  get address(): Address | null {
    return this.props.address;
  }
  get serviceTimes(): readonly ServiceTime[] {
    return this.props.serviceTimes;
  }

  rename(name: CongregationName): Congregation {
    return this.with({ name });
  }

  changeAddress(address: Address | null): Congregation {
    return this.with({ address });
  }

  changeServiceTimes(serviceTimes: readonly ServiceTime[]): Congregation {
    assertNoSlotClash(serviceTimes);
    return this.with({ serviceTimes: Object.freeze([...serviceTimes]) });
  }

  deactivate(): Congregation {
    if (this.isHeadquarters) throw new CannotDeactivateHeadquartersError();
    if (this.status === 'INACTIVE') {
      throw new CongregationAlreadyInStatusError('INACTIVE');
    }
    return this.with({ status: 'INACTIVE' });
  }

  reactivate(): Congregation {
    if (this.status === 'ACTIVE') {
      throw new CongregationAlreadyInStatusError('ACTIVE');
    }
    return this.with({ status: 'ACTIVE' });
  }

  /** Chamado pela raiz ao designar a sede. */
  markAsHeadquarters(): Congregation {
    if (this.isHeadquarters) throw new CongregationAlreadyHeadquartersError();
    if (this.status === 'INACTIVE') throw new CongregationInactiveError();
    return this.with({ isHeadquarters: true });
  }

  /** Chamado pela raiz ao trocar a sede. */
  unmarkAsHeadquarters(): Congregation {
    return this.with({ isHeadquarters: false });
  }

  private with(changes: Partial<CongregationProps>): Congregation {
    return new Congregation({ ...this.props, ...changes });
  }
}

function assertNoSlotClash(serviceTimes: readonly ServiceTime[]): void {
  const clash = serviceTimes.some((time, index) =>
    serviceTimes
      .slice(index + 1)
      .some((other) => time.occupiesSameSlotAs(other)),
  );

  if (clash) {
    throw new ValidationError(
      'serviceTimes',
      'Há dois cultos no mesmo dia e horário.',
    );
  }
}
