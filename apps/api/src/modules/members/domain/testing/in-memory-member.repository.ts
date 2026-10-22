import { ConcurrencyConflictError } from '../../../../shared/domain/concurrency-conflict.error.js';
import type {
  CongregationId,
  OrganizationId,
} from '../../../../shared/domain/identifiers.js';
import { MemberNotFoundError } from '../errors.js';
import type { MemberId } from '../ids.js';
import { Member, type MemberProps } from '../member.js';
import type { MemberHistoryEvent } from '../member-history-event.js';
import type {
  MemberPage,
  MemberRepository,
  MemberSearchCriteria,
} from '../member.repository.js';

interface Stored {
  props: MemberProps;
  events: MemberHistoryEvent[];
}

/** Repositório em memória para testes: guarda e devolve CÓPIAS e aplica o travamento otimista por versão. */
export class InMemoryMemberRepository implements MemberRepository {
  readonly #store = new Map<string, Stored>();

  findById(
    organizationId: OrganizationId,
    id: MemberId,
  ): Promise<Member | null> {
    const stored = this.#store.get(id);
    return Promise.resolve(
      stored && stored.props.organizationId === organizationId
        ? Member.restore(stored.props)
        : null,
    );
  }

  listHistory(
    organizationId: OrganizationId,
    id: MemberId,
  ): Promise<MemberHistoryEvent[]> {
    const stored = this.#store.get(id);
    if (!stored || stored.props.organizationId !== organizationId) {
      return Promise.resolve([]);
    }
    // Mais recente primeiro; empate (mesmo instante) desempata pela ordem de gravação, a mais nova antes.
    const events = stored.events
      .map((event, index) => ({ event, index }))
      .sort(
        (a, b) =>
          b.event.recordedAt.getTime() - a.event.recordedAt.getTime() ||
          b.index - a.index,
      )
      .map(({ event }) => event);
    return Promise.resolve(events);
  }

  add(member: Member): Promise<void> {
    this.#store.set(member.id, {
      props: snapshot(member),
      events: [...member.pendingEvents],
    });
    return Promise.resolve();
  }

  save(member: Member): Promise<void> {
    const stored = this.#store.get(member.id);
    if (!stored || stored.props.organizationId !== member.organizationId) {
      return Promise.reject(new MemberNotFoundError());
    }
    if (stored.props.version !== member.version) {
      return Promise.reject(new ConcurrencyConflictError());
    }

    const events = [...stored.events, ...member.pendingEvents];
    this.#store.set(member.id, {
      props: { ...snapshot(member), version: member.version + 1 },
      // Anonimizado: as observações antigas (texto livre, podem ter dado pessoal) são apagadas.
      events: member.isAnonymized
        ? events.map((event) => ({ ...event, notes: null }))
        : events,
    });
    return Promise.resolve();
  }

  search(
    organizationId: OrganizationId,
    criteria: MemberSearchCriteria,
  ): Promise<MemberPage> {
    const allowed: ReadonlySet<CongregationId> | null = criteria.congregationIds
      ? new Set(criteria.congregationIds)
      : null;

    const matches = [...this.#store.values()]
      .map((stored) => stored.props)
      .filter(
        (props) =>
          props.organizationId === organizationId &&
          props.anonymizedAt === null &&
          (allowed === null || allowed.has(props.congregationId)) &&
          (criteria.status === null || props.status === criteria.status) &&
          (criteria.term === null ||
            props.fullName.searchKey.includes(criteria.term)),
      )
      .sort(
        (a, b) =>
          a.fullName.searchKey.localeCompare(b.fullName.searchKey) ||
          a.id.localeCompare(b.id),
      );

    return Promise.resolve({
      total: matches.length,
      items: matches
        .slice(criteria.offset, criteria.offset + criteria.limit)
        .map((props) => ({
          id: props.id,
          fullName: props.fullName.value,
          congregationId: props.congregationId,
          status: props.status,
        })),
    });
  }
}

function snapshot(member: Member): MemberProps {
  return {
    id: member.id,
    organizationId: member.organizationId,
    congregationId: member.congregationId,
    fullName: member.fullName,
    birthDate: member.birthDate,
    phone: member.phone,
    email: member.email,
    address: member.address,
    status: member.status,
    anonymizedAt: member.anonymizedAt,
    version: member.version,
  };
}
    position: member.position,
