import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { ServiceTime } from './service-time.js';

const sunday = {
  weekday: 'SUNDAY',
  time: '19:00',
  name: 'Culto de celebração',
} as const;

describe('ServiceTime', () => {
  it('cria um horário de culto válido', () => {
    expect(ServiceTime.create(sunday).toPrimitives()).toEqual(sunday);
  });

  it('remove espaços do nome', () => {
    expect(
      ServiceTime.create({ ...sunday, name: '  Culto  de   celebração ' }).name,
    ).toBe('Culto de celebração');
  });

  it.each(['00:00', '09:30', '19:00', '23:59'])(
    'aceita o horário %s',
    (time) => {
      expect(ServiceTime.create({ ...sunday, time }).time).toBe(time);
    },
  );

  it.each(['24:00', '7:00', '19:60', '19h', '', '19:0'])(
    'rejeita o horário "%s"',
    (time) => {
      const error = thrownBy(() => ServiceTime.create({ ...sunday, time }));

      expect(error).toBeInstanceOf(ValidationError);
      expect(error).toMatchObject({ field: 'time' });
    },
  );

  it('rejeita dia da semana inexistente', () => {
    const error = thrownBy(() =>
      ServiceTime.create({ ...sunday, weekday: 'DOMINGO' }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'weekday' });
  });

  it.each(['', '   '])('rejeita nome vazio: "%s"', (name) => {
    const error = thrownBy(() => ServiceTime.create({ ...sunday, name }));

    expect(error).toMatchObject({ field: 'name' });
  });

  it('rejeita nome com mais de 60 caracteres', () => {
    expect(() =>
      ServiceTime.create({ ...sunday, name: 'a'.repeat(61) }),
    ).toThrow(ValidationError);
  });

  it('reconhece o mesmo "encaixe" (dia + hora) mesmo com nome diferente', () => {
    const a = ServiceTime.create(sunday);
    const b = ServiceTime.create({ ...sunday, name: 'Outro nome' });
    const c = ServiceTime.create({ ...sunday, time: '09:00' });

    expect(a.occupiesSameSlotAs(b)).toBe(true);
    expect(a.occupiesSameSlotAs(c)).toBe(false);
  });

  it('compara por valor, considerando o nome', () => {
    const a = ServiceTime.create(sunday);

    expect(a.equals(ServiceTime.create(sunday))).toBe(true);
    expect(
      a.equals(ServiceTime.create({ ...sunday, name: 'Outro nome' })),
    ).toBe(false);
  });
});
