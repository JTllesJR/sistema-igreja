import { ValidationError } from './domain-error.js';

const FORMAT = /^(\d{4})-(\d{2})-(\d{2})$/;
const MIN_YEAR = 1900;

/**
 * Data de calendário (sem hora nem fuso), como "2026-10-21". Datas de nascimento e de batismo são DIAS, não instantes:
 * guardá-las como `Date` faria "1990-05-10" virar "1990-05-09" para quem está a oeste de Greenwich.
 *
 * A comparação de datas ISO como texto já é a ordem cronológica, então `isAfter` é uma comparação de strings.
 */
export class CalendarDate {
  private constructor(readonly value: string) {}

  /** Valida o formato E se o dia existe ("2026-02-30" é recusado). `field` identifica o campo na mensagem de erro. */
  static parse(raw: string, field: string): CalendarDate {
    const match = FORMAT.exec(raw);
    if (!match) {
      throw new ValidationError(
        field,
        'A data deve estar no formato AAAA-MM-DD.',
      );
    }

    const [year, month, day] = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    ];
    const check = new Date(Date.UTC(year, month - 1, day));
    const exists =
      check.getUTCFullYear() === year &&
      check.getUTCMonth() === month - 1 &&
      check.getUTCDate() === day;
    if (!exists || year < MIN_YEAR) {
      throw new ValidationError(field, 'A data informada não é válida.');
    }
    return new CalendarDate(raw);
  }

  /** O dia (em UTC) de um instante. O Brasil está atrás do UTC, então a data local nunca passa a daqui. */
  static fromInstant(instant: Date): CalendarDate {
    return new CalendarDate(instant.toISOString().slice(0, 10));
  }

  /** Reconstrói a partir de uma data gravada no banco (meia-noite UTC). */
  static fromStoredDate(stored: Date): CalendarDate {
    return CalendarDate.fromInstant(stored);
  }

  isAfter(other: CalendarDate): boolean {
    return this.value > other.value;
  }

  equals(other: CalendarDate): boolean {
    return this.value === other.value;
  }

  /** Meia-noite UTC desse dia: o formato que o tipo `DATE` do banco espera. */
  toDate(): Date {
    return new Date(`${this.value}T00:00:00.000Z`);
  }
}
