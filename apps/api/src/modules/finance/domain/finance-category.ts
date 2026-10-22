import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import type { ArchiveStatus } from './financial-account.js';
import type { CategoryId } from './ids.js';
import { validName } from './text.js';

export const ENTRY_DIRECTIONS = ['IN', 'OUT'] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];
export const isEntryDirection = (value: string): value is EntryDirection =>
  (ENTRY_DIRECTIONS as readonly string[]).includes(value);

export interface FinanceCategoryProps {
  id: CategoryId;
  organizationId: OrganizationId;
  name: string;
  direction: EntryDirection;
  status: ArchiveStatus;
  version: number;
}

/**
 * Categoria de entradas ou de saídas, por igreja (personalizável). Nunca é apagada: fica arquivada e deixa de aparecer
 * para novos lançamentos, sem mexer nos antigos.
 */
export class FinanceCategory {
  #props: FinanceCategoryProps;

  private constructor(props: FinanceCategoryProps) {
    this.#props = props;
  }

  static register(input: {
    id: CategoryId;
    organizationId: OrganizationId;
    name: string;
    direction: EntryDirection;
  }): FinanceCategory {
    return new FinanceCategory({
      id: input.id,
      organizationId: input.organizationId,
      name: validName(input.name, 'name'),
      direction: input.direction,
      status: 'ACTIVE',
      version: 0,
    });
  }

  static restore(props: FinanceCategoryProps): FinanceCategory {
    return new FinanceCategory({ ...props });
  }

  get id(): CategoryId {
    return this.#props.id;
  }
  get organizationId(): OrganizationId {
    return this.#props.organizationId;
  }
  get name(): string {
    return this.#props.name;
  }
  get direction(): EntryDirection {
    return this.#props.direction;
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

/** Categorias criadas por padrão em toda igreja (a igreja pode acrescentar as suas). */
export const DEFAULT_CATEGORIES: readonly {
  name: string;
  direction: EntryDirection;
}[] = [
  { name: 'Dízimo', direction: 'IN' },
  { name: 'Oferta', direction: 'IN' },
  { name: 'Contribuição específica', direction: 'IN' },
  { name: 'Doação', direction: 'IN' },
  { name: 'Outras entradas', direction: 'IN' },
  { name: 'Água, luz e telefone', direction: 'OUT' },
  { name: 'Aluguel', direction: 'OUT' },
  { name: 'Manutenção e reformas', direction: 'OUT' },
  { name: 'Material de consumo', direction: 'OUT' },
  { name: 'Ajuda social', direction: 'OUT' },
  { name: 'Eventos', direction: 'OUT' },
  { name: 'Outras saídas', direction: 'OUT' },
];
