import { Prisma } from '../../../generated/prisma/client.js';
import type { PrismaService } from '../../../platform/database/prisma.service.js';
import {
  Address,
  type AddressPrimitives,
} from '../../../shared/domain/address.js';
import { ConcurrencyConflictError } from '../../../shared/domain/concurrency-conflict.error.js';
import {
  CongregationId,
  OrganizationId,
} from '../../../shared/domain/identifiers.js';
import { CalendarDate } from '../domain/calendar-date.js';
import { ContactEmail } from '../domain/contact-email.js';
import { MemberNotFoundError } from '../domain/errors.js';
import { MemberEventId, MemberId } from '../domain/ids.js';
import { Member } from '../domain/member.js';
import type {
  MemberPage,
  MemberRepository,
  MemberSearchCriteria,
} from '../domain/member.repository.js';
import type { MemberHistoryEvent } from '../domain/member-history-event.js';
import { PersonName } from '../domain/person-name.js';
import { Phone } from '../domain/phone.js';

type MemberRow = Prisma.MemberGetPayload<object>;
type EventRow = Prisma.MemberHistoryEventGetPayload<object>;

/**
 * Repositório do agregado `Member` sobre PostgreSQL. Cumpre o mesmo contrato do repositório em memória.
 *
 * TODA consulta leva `organization_id` no filtro (ADR 0003): não existe caminho que ache um membro só pelo id.
 * `add` e `save` rodam em UMA transação (o membro e seus eventos entram juntos ou não entram). O travamento otimista é
 * um `UPDATE ... WHERE version = ?`.
 */
export class PrismaMemberRepository implements MemberRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    organizationId: OrganizationId,
    id: MemberId,
  ): Promise<Member | null> {
    const row = await this.prisma.member.findFirst({
      where: { id, organizationId },
    });
    return row ? toDomain(row) : null;
  }

  async listHistory(
    organizationId: OrganizationId,
    id: MemberId,
  ): Promise<MemberHistoryEvent[]> {
    const rows = await this.prisma.memberHistoryEvent.findMany({
      where: { organizationId, memberId: id },
      // Empate de instante: o id (UUID v7, que cresce com o tempo) desempata, e o mais novo vem antes.
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toEvent);
  }

  async add(member: Member): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.member.create({
        data: {
          id: member.id,
          organizationId: member.organizationId,
          version: member.version,
          ...toColumns(member),
        },
      });
      await tx.memberHistoryEvent.createMany({
        data: eventData(member),
      });
    });
  }

  async save(member: Member): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Travamento otimista: só acerta a linha se a versão ainda for a lida. Com duas gravações simultâneas, a segunda
      // espera a primeira confirmar, reavalia a condição, não acha a linha e cai no conflito abaixo.
      const updated = await tx.member.updateMany({
        where: {
          id: member.id,
          organizationId: member.organizationId,
          version: member.version,
        },
        data: { ...toColumns(member), version: { increment: 1 } },
      });

      if (updated.count === 0) {
        const exists = await tx.member.findFirst({
          where: { id: member.id, organizationId: member.organizationId },
          select: { id: true },
        });
        if (!exists) throw new MemberNotFoundError();
        throw new ConcurrencyConflictError();
      }

      await tx.memberHistoryEvent.createMany({ data: eventData(member) });

      // Anonimizado: as observações dos eventos antigos são texto livre e podem ter dado pessoal. Apaga todas.
      if (member.isAnonymized) {
        await tx.memberHistoryEvent.updateMany({
          where: { organizationId: member.organizationId, memberId: member.id },
          data: { notes: null },
        });
      }
    });
  }

  async search(
    organizationId: OrganizationId,
    criteria: MemberSearchCriteria,
  ): Promise<MemberPage> {
    const where: Prisma.MemberWhereInput = {
      organizationId,
      anonymizedAt: null,
      // O ESCOPO do usuário entra na própria consulta. Lista vazia = `IN ()` = nenhuma linha.
      ...(criteria.congregationIds === null
        ? {}
        : { congregationId: { in: [...criteria.congregationIds] } }),
      ...(criteria.status === null ? {} : { status: criteria.status }),
      // `contains` escapa % e _ : o termo é sempre texto, nunca padrão.
      ...(criteria.term === null
        ? {}
        : { nameKey: { contains: criteria.term } }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.member.findMany({
        where,
        orderBy: [{ nameKey: 'asc' }, { id: 'asc' }],
        skip: criteria.offset,
        take: criteria.limit,
        select: {
          id: true,
          fullName: true,
          congregationId: true,
          status: true,
        },
      }),
      this.prisma.member.count({ where }),
    ]);

    return {
      total,
      items: rows.map((row) => ({
        id: MemberId.of(row.id),
        fullName: row.fullName,
        congregationId: CongregationId.of(row.congregationId),
        status: row.status,
      })),
    };
  }
}

/** Colunas que mudam ao gravar o agregado (tudo, menos o que identifica e a versão). */
function toColumns(member: Member) {
  return {
    congregationId: member.congregationId,
    fullName: member.fullName.value,
    nameKey: member.fullName.searchKey,
    birthDate: member.birthDate?.toDate() ?? null,
    phone: member.phone?.value ?? null,
    email: member.email?.value ?? null,
    address: member.address
      ? (member.address.toPrimitives() as unknown as Prisma.InputJsonObject)
      : Prisma.JsonNull,
    status: member.status,
    anonymizedAt: member.anonymizedAt,
  };
}

function eventData(member: Member): Prisma.MemberHistoryEventCreateManyInput[] {
  return member.pendingEvents.map((event) => ({
    id: event.id,
    organizationId: member.organizationId,
    memberId: member.id,
    type: event.type,
    occurredOn: event.occurredOn.toDate(),
    notes: event.notes,
    fromCongregationId: event.fromCongregationId,
    toCongregationId: event.toCongregationId,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    recordedAt: event.recordedAt,
  }));
}

/** Reconstrói revalidando: dado corrompido no banco aparece como erro, não passa em silêncio. */
function toDomain(row: MemberRow): Member {
  return Member.restore({
    id: MemberId.of(row.id),
    organizationId: OrganizationId.of(row.organizationId),
    congregationId: CongregationId.of(row.congregationId),
    fullName: PersonName.create(row.fullName),
    birthDate: row.birthDate
      ? CalendarDate.fromStoredDate(row.birthDate)
      : null,
    phone: row.phone === null ? null : Phone.create(row.phone),
    email: row.email === null ? null : ContactEmail.create(row.email),
    address:
      row.address === null
        ? null
        : Address.fromPrimitives(row.address as unknown as AddressPrimitives),
    status: row.status,
    anonymizedAt: row.anonymizedAt,
    version: row.version,
  });
}

function toEvent(row: EventRow): MemberHistoryEvent {
  return {
    id: MemberEventId.of(row.id),
    type: row.type,
    occurredOn: CalendarDate.fromStoredDate(row.occurredOn),
    notes: row.notes,
    fromCongregationId:
      row.fromCongregationId === null
        ? null
        : CongregationId.of(row.fromCongregationId),
    toCongregationId:
      row.toCongregationId === null
        ? null
        : CongregationId.of(row.toCongregationId),
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    recordedAt: row.recordedAt,
  };
}
