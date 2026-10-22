import type {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import type { AccountId } from './ids.js';
import { validName } from './text.js';

export const ACCOUNT_KINDS = ['CASH', 'BANK'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];
export const isAccountKind = (value: string): value is AccountKind =>
  (ACCOUNT_KINDS as readonly string[]).includes(value);

export type ArchiveStatus = 'ACTIVE' | 'ARCHIVED';

export interface FinancialAccountProps {
  id: AccountId;
  organizationId: OrganizationId;
  congregationId: CongregationId;
  name: string;
  kind: AccountKind;
  status: ArchiveStatus;
  version: number;
}

/**
 * Conta (caixa ou banco) de UMA congregação. Nunca é apagada: fica arquivada, e conta arquivada não recebe lançamentos
 * novos (os antigos continuam, e o saldo dela continua calculável). O SALDO não é guardado aqui: é calculado dos
 * lançamentos confirmados (ADR 0005).
 */
export class FinancialAccount {
  #props: FinancialAccountProps;

  private constructor(props: FinancialAccountProps) {
    this.#props = props;
  }

  static register(input: {
    id: AccountId;
    organizationId: OrganizationId;
    congregationId: CongregationId;
    name: string;
    kind: AccountKind;
  }): FinancialAccount {
    return new FinancialAccount({
      id: input.id,
      organizationId: input.organizationId,
      congregationId: input.congregationId,
      name: validName(input.name, 'name'),
      kind: input.kind,
      status: 'ACTIVE',
      version: 0,
    });
  }

  static restore(props: FinancialAccountProps): FinancialAccount {
    return new FinancialAccount({ ...props });
  }

  get id(): AccountId {
    return this.#props.id;
  }
  get organizationId(): OrganizationId {
    return this.#props.organizationId;
  }
  get congregationId(): CongregationId {
    return this.#props.congregationId;
  }
  get name(): string {
    return this.#props.name;
  }
  get kind(): AccountKind {
    return this.#props.kind;
  }
  get status(): ArchiveStatus {
    return this.#props.status;
  }
  get version(): number {
    return this.#props.version;
  }
  get isActive(): boolean {
    return this.#props.status === 'ACTIVE';
  }

  rename(name: string): void {
    this.#props = { ...this.#props, name: validName(name, 'name') };
  }

  archive(): void {
    this.#props = { ...this.#props, status: 'ARCHIVED' };
  }

  unarchive(): void {
    this.#props = { ...this.#props, status: 'ACTIVE' };
  }
}
