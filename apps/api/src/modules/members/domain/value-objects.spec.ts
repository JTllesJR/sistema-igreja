import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { CalendarDate } from './calendar-date.js';
import { ContactEmail } from './contact-email.js';
import { ANONYMIZED_NAME, PersonName } from './person-name.js';
import { Phone } from './phone.js';

describe('CalendarDate', () => {
  it.each(['1990-05-10', '2024-02-29', '1900-01-01', '2026-12-31'])(
    'aceita %s',
    (raw) => {
      expect(CalendarDate.parse(raw, 'd').value).toBe(raw);
    },
  );

  it.each([
    '2026-02-30',
    '2023-02-29', // não é bissexto
    '2026-13-01',
    '2026-00-10',
    '1899-12-31', // antes de 1900
    '2026-5-1',
    '10/05/1990',
    '',
    '2026-10-20T10:00:00Z',
  ])('recusa %j', (raw) => {
    expect(thrownBy(() => CalendarDate.parse(raw, 'birthDate'))).toBeInstanceOf(
      ValidationError,
    );
  });

  it('compara como calendário, não como texto qualquer', () => {
    expect(
      CalendarDate.parse('2026-10-21', 'd').isAfter(
        CalendarDate.parse('2026-10-20', 'd'),
      ),
    ).toBe(true);
    expect(
      CalendarDate.parse('2026-10-20', 'd').isAfter(
        CalendarDate.parse('2026-10-20', 'd'),
      ),
    ).toBe(false);
    expect(
      CalendarDate.parse('2025-12-31', 'd').isAfter(
        CalendarDate.parse('2026-01-01', 'd'),
      ),
    ).toBe(false);
  });

  it('o dia de um instante é o dia em UTC e a ida e volta com Date não escorrega um dia', () => {
    expect(
      CalendarDate.fromInstant(new Date('2026-10-20T23:59:59.999Z')).value,
    ).toBe('2026-10-20');
    const date = CalendarDate.parse('1990-05-10', 'd');
    expect(CalendarDate.fromStoredDate(date.toDate()).value).toBe('1990-05-10');
  });
});

describe('PersonName', () => {
  it('apara e reduz espaços', () => {
    expect(PersonName.create('  Maria   da  Silva ').value).toBe(
      'Maria da Silva',
    );
  });

  it('a chave de busca ignora acentos e caixa', () => {
    expect(PersonName.create('JOSÉ Conceição').searchKey).toBe(
      'jose conceicao',
    );
  });

  it.each([
    ['curto demais', 'A'],
    ['só espaços', '   '],
    ['longo demais', 'a'.repeat(151)],
    ['sem nenhuma letra', '1234 -- 5678'],
    ['com quebra de linha dentro', 'Maria\u0000Silva'],
  ])('recusa nome %s', (_nome, raw) => {
    expect(thrownBy(() => PersonName.create(raw))).toBeInstanceOf(
      ValidationError,
    );
  });

  it('aceita nomes reais variados: acentos, apóstrofo, hífen, outros alfabetos', () => {
    for (const raw of ["Maria D'Ávila", 'João-Pedro Souza', 'Zhang Wei 张伟']) {
      expect(PersonName.create(raw).value).toBe(raw);
    }
  });

  it('o nome anonimizado é fixo e não revela nada', () => {
    expect(PersonName.anonymized().value).toBe(ANONYMIZED_NAME);
  });
});

describe('Phone', () => {
  it.each([
    ['(81) 99999-8888', '81999998888'],
    ['81 3333-4444', '8133334444'],
    ['+55 81 99999-8888', '81999998888'],
    ['5581999998888', '81999998888'],
    ['81999998888', '81999998888'],
  ])('normaliza %j para %s', (raw, expected) => {
    expect(Phone.create(raw).value).toBe(expected);
  });

  it.each([
    '99999-8888',
    '123',
    '(81) 99999-88889',
    '+1 415 555 0100 12345',
    'abc',
    '',
  ])('recusa %j', (raw) => {
    expect(thrownBy(() => Phone.create(raw))).toBeInstanceOf(ValidationError);
  });

  it('um número que só começa com 55 (DDD 55) não perde os dígitos', () => {
    expect(Phone.create('(55) 99999-8888').value).toBe('55999998888');
  });
});

describe('ContactEmail', () => {
  it('aparo e minúsculas', () => {
    expect(ContactEmail.create('  Maria@Exemplo.COM ').value).toBe(
      'maria@exemplo.com',
    );
  });

  it.each([
    'semarroba',
    'a@b',
    '@b.com',
    'a@.com',
    'a b@c.com',
    'a@b\n.com',
    `${'a'.repeat(250)}@b.com`,
  ])('recusa %j', (raw) => {
    expect(thrownBy(() => ContactEmail.create(raw))).toBeInstanceOf(
      ValidationError,
    );
  });
});
