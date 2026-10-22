import type { CongregationId } from '../../../shared/domain/identifiers.js';
import type { CalendarDate } from '../../../shared/domain/calendar-date.js';
import type { MemberEventId } from './ids.js';
import type { MemberStatus } from './member-status.js';

/**
 * - `REGISTERED`, `TRANSFER`, `STATUS_CHANGE` e `ANONYMIZED` são gerados PELO SISTEMA quando o fato acontece.
 * - `BAPTISM` e `RECEPTION` são informados por quem cadastra (com a data em que ocorreram).
 */
export const MANUAL_EVENT_TYPES = ['BAPTISM', 'RECEPTION'] as const;
export type ManualEventType = (typeof MANUAL_EVENT_TYPES)[number];

export const isManualEventType = (value: string): value is ManualEventType =>
  (MANUAL_EVENT_TYPES as readonly string[]).includes(value);

export type MemberEventType =
  ManualEventType | 'REGISTERED' | 'TRANSFER' | 'STATUS_CHANGE' | 'ANONYMIZED';

/**
 * Um fato da vida eclesiástica do membro. SOMENTE-ANEXAÇÃO: não há como editar nem apagar um evento (como os lançamentos
 * financeiros, ADR 0005); o histórico é a memória do que aconteceu. A única exceção é a anonimização, que limpa `notes`.
 */
export interface MemberHistoryEvent {
  readonly id: MemberEventId;
  readonly type: MemberEventType;
  /** Quando o fato aconteceu (ex.: o dia do batismo). */
  readonly occurredOn: CalendarDate;
  readonly notes: string | null;
  readonly fromCongregationId: CongregationId | null;
  readonly toCongregationId: CongregationId | null;
  readonly fromStatus: MemberStatus | null;
  readonly toStatus: MemberStatus | null;
  /** Quando foi registrado no sistema. */
  readonly recordedAt: Date;
}
