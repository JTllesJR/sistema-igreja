import { ValidationError } from '../../../shared/domain/domain-error.js';
import { collapseWhitespace } from '../../../shared/domain/text.js';

export const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** Horário em 24h, "HH:mm". */
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const NAME_MAX_LENGTH = 60;

export interface ServiceTimePrimitives {
  weekday: Weekday;
  time: string;
  name: string;
}

/** Um horário de culto recorrente (ex.: domingo às 19:00, "Culto de celebração"). */
export class ServiceTime {
  private constructor(
    readonly weekday: Weekday,
    readonly time: string,
    readonly name: string,
  ) {}

  static create(input: {
    weekday: string;
    time: string;
    name: string;
  }): ServiceTime {
    if (!(WEEKDAYS as readonly string[]).includes(input.weekday)) {
      throw new ValidationError('weekday', 'O dia da semana é inválido.');
    }

    if (!TIME.test(input.time)) {
      throw new ValidationError(
        'time',
        'O horário deve estar no formato HH:mm (24h).',
      );
    }

    const name = collapseWhitespace(input.name);
    if (name === '' || name.length > NAME_MAX_LENGTH) {
      throw new ValidationError(
        'name',
        `O nome do culto deve ter entre 1 e ${NAME_MAX_LENGTH} caracteres.`,
      );
    }

    return new ServiceTime(input.weekday as Weekday, input.time, name);
  }

  toPrimitives(): ServiceTimePrimitives {
    return { weekday: this.weekday, time: this.time, name: this.name };
  }

  /** Mesmo dia e hora, independentemente do nome. Usado para impedir dois cultos "no mesmo encaixe". */
  occupiesSameSlotAs(other: ServiceTime): boolean {
    return this.weekday === other.weekday && this.time === other.time;
  }

  equals(other: ServiceTime): boolean {
    return this.occupiesSameSlotAs(other) && this.name === other.name;
  }
}
