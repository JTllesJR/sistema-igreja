import { describe, expect, it } from 'vitest';
import { Address } from '../../../shared/domain/address.js';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import { ContactEmail } from './contact-email.js';
import {
  MemberAlreadyInCongregationError,
  MemberAlreadyInStatusError,
  MemberAnonymizedError,
} from './errors.js';
import { MEMBER_POSITIONS, isMemberPosition } from './member-position.js';
import { Member } from './member.js';
import { ANONYMIZED_NAME, PersonName } from './person-name.js';
import { Phone } from './phone.js';
import {
  NOW,
  aMember,
  after,
  anAddress,
  congId,
  date,
  eventId,
  memberId,
  orgId,
} from './testing/fixtures.js';

const DAY = 24 * 60 * 60_000;

describe('Member.register', () => {
  it('nasce ativo, na congregação informada, e já com o evento REGISTERED pendente', () => {
    const member = aMember(1, { congregation: 2 });

    expect(member.status).toBe('ACTIVE');
    expect(member.congregationId).toBe(congId(2));
    expect(member.version).toBe(0);
    expect(member.isAnonymized).toBe(false);
    expect(member.pendingEvents).toEqual([
      {
        id: eventId(1),
        type: 'REGISTERED',
        occurredOn: date('2026-10-20'),
        notes: null,
        fromCongregationId: null,
        toCongregationId: congId(2),
        fromStatus: null,
        toStatus: null,
        recordedAt: NOW,
      },
    ]);
  });

  it('dados de contato e nascimento são opcionais', () => {
    const member = aMember(1);

    expect(member.birthDate).toBeNull();
    expect(member.phone).toBeNull();
    expect(member.email).toBeNull();
    expect(member.address).toBeNull();
  });

  it('guarda os dados informados', () => {
    const member = aMember(1, { full: true });

    expect(member.birthDate?.value).toBe('1990-05-10');
    expect(member.phone?.value).toBe('81999998888');
    expect(member.email?.value).toBe('maria@exemplo.com');
    expect(member.address?.toPrimitives().city).toBe('Recife');
  });

  it('nascimento no futuro é recusado; hoje é aceito', () => {
    const register = (birthDate: string) =>
      Member.register({
        id: memberId(1),
        organizationId: orgId(),
        congregationId: congId(1),
        fullName: PersonName.create('Maria'),
        birthDate: date(birthDate),
        eventId: eventId(1),
        now: NOW,
      });

    expect(thrownBy(() => register('2026-10-21'))).toBeInstanceOf(
      ValidationError,
    );
    expect(register('2026-10-20').birthDate?.value).toBe('2026-10-20');
  });

  it('pendingEvents devolve uma cópia: quem recebe não altera a lista interna', () => {
    const member = aMember(1);

    (member.pendingEvents as unknown[]).pop();

    expect(member.pendingEvents).toHaveLength(1);
  });
});

describe('Member.restore', () => {
  it('reconstrói sem eventos pendentes e com a versão gravada', () => {
    const restored = Member.restore({
      id: memberId(1),
      organizationId: orgId(),
      congregationId: congId(1),
      fullName: PersonName.create('Maria'),
      birthDate: null,
      phone: null,
      email: null,
      address: null,
      status: 'AWAY',
      position: 'DEACON',
      anonymizedAt: null,
      version: 7,
    });

    expect(restored.pendingEvents).toEqual([]);
    expect(restored.version).toBe(7);
    expect(restored.status).toBe('AWAY');
    expect(restored.position).toBe('DEACON');
  });
});

describe('cargo (position)', () => {
  it('quem se cadastra é membro, sem cargo, a menos que se diga outro', () => {
    expect(aMember(1).position).toBe('MEMBER');
  });

  it('o cargo muda pelo cadastro e aparece entre os campos alterados (só o nome do campo)', () => {
    const member = aMember(1);

    const changed = member.updateProfile({ position: 'PRESBYTER' }, NOW);

    expect(changed).toEqual(['position']);
    expect(member.position).toBe('PRESBYTER');
  });

  it('repetir o cargo atual não é mudança', () => {
    const member = aMember(1);

    expect(member.updateProfile({ position: 'MEMBER' }, NOW)).toEqual([]);
  });

  it('os sete cargos da igreja existem', () => {
    expect(MEMBER_POSITIONS).toEqual([
      'MEMBER',
      'AUXILIARY',
      'DEACON',
      'DEACONESS',
      'PRESBYTER',
      'EVANGELIST',
      'PASTOR',
    ]);
    expect(isMemberPosition('PASTOR')).toBe(true);
    expect(isMemberPosition('BISPO')).toBe(false);
  });

  it('o membro anonimizado não muda de cargo', () => {
    const member = aMember(1);
    member.anonymize(eventId(2), NOW);

    expect(() => member.updateProfile({ position: 'PASTOR' }, NOW)).toThrow();
  });
});

describe('updateProfile', () => {
  it('altera só o que foi informado e devolve os NOMES dos campos que mudaram', () => {
    const member = aMember(1, { full: true });

    const changed = member.updateProfile(
      {
        fullName: PersonName.create('Maria Souza'),
        phone: Phone.create('81 3333-4444'),
      },
      NOW,
    );

    expect(changed).toEqual(['fullName', 'phone']);
    expect(member.fullName.value).toBe('Maria Souza');
    expect(member.phone?.value).toBe('8133334444');
    expect(member.email?.value).toBe('maria@exemplo.com');
    expect(member.birthDate?.value).toBe('1990-05-10');
  });

  it('valor igual ao atual não conta como mudança (nada a gravar)', () => {
    const member = aMember(1, { full: true });

    const changed = member.updateProfile(
      {
        fullName: PersonName.create('Maria da Silva 1'),
        phone: Phone.create('(81) 99999-8888'),
        email: ContactEmail.create('MARIA@exemplo.com'),
        birthDate: date('1990-05-10'),
        address: anAddress(),
      },
      NOW,
    );

    expect(changed).toEqual([]);
  });

  it('null apaga o campo opcional; ausente mantém', () => {
    const member = aMember(1, { full: true });

    const changed = member.updateProfile({ phone: null, address: null }, NOW);

    expect(changed).toEqual(['phone', 'address']);
    expect(member.phone).toBeNull();
    expect(member.address).toBeNull();
    expect(member.email).not.toBeNull();
  });

  it('apagar um campo que já estava vazio não é mudança', () => {
    const member = aMember(1);

    expect(member.updateProfile({ phone: null }, NOW)).toEqual([]);
  });

  it('trocar o endereço por outro diferente é mudança', () => {
    const member = aMember(1, { full: true });

    const changed = member.updateProfile(
      {
        address: Address.create({
          street: 'Rua B',
          city: 'Olinda',
          state: 'PE',
        }),
      },
      NOW,
    );

    expect(changed).toEqual(['address']);
  });

  it('não gera evento de história (a auditoria registra quem alterou o quê)', () => {
    const member = aMember(1);
    const before = member.pendingEvents.length;

    member.updateProfile({ fullName: PersonName.create('Outro Nome') }, NOW);

    expect(member.pendingEvents).toHaveLength(before);
  });

  it('nascimento no futuro é recusado e nada é alterado', () => {
    const member = aMember(1, { full: true });

    expect(
      thrownBy(() =>
        member.updateProfile(
          { birthDate: date('2030-01-01'), phone: null },
          NOW,
        ),
      ),
    ).toBeInstanceOf(ValidationError);
    expect(member.phone).not.toBeNull();
  });
});

describe('changeStatus', () => {
  it('muda a situação e registra de onde para onde', () => {
    const member = aMember(1);

    member.changeStatus('AWAY', eventId(2), after(NOW, DAY));

    expect(member.status).toBe('AWAY');
    expect(member.pendingEvents.at(-1)).toMatchObject({
      id: eventId(2),
      type: 'STATUS_CHANGE',
      fromStatus: 'ACTIVE',
      toStatus: 'AWAY',
      occurredOn: date('2026-10-21'),
    });
  });

  it('repetir a situação atual é recusado e não gera evento', () => {
    const member = aMember(1);

    expect(
      thrownBy(() => member.changeStatus('ACTIVE', eventId(2), NOW)),
    ).toBeInstanceOf(MemberAlreadyInStatusError);
    expect(member.pendingEvents).toHaveLength(1);
  });
});

describe('transferTo', () => {
  it('muda de congregação e registra de onde para onde', () => {
    const member = aMember(1, { congregation: 1 });

    member.transferTo(congId(2), eventId(2), NOW);

    expect(member.congregationId).toBe(congId(2));
    expect(member.pendingEvents.at(-1)).toMatchObject({
      type: 'TRANSFER',
      fromCongregationId: congId(1),
      toCongregationId: congId(2),
    });
  });

  it('transferir para a congregação em que já está é recusado', () => {
    const member = aMember(1, { congregation: 1 });

    expect(
      thrownBy(() => member.transferTo(congId(1), eventId(2), NOW)),
    ).toBeInstanceOf(MemberAlreadyInCongregationError);
    expect(member.pendingEvents).toHaveLength(1);
  });
});

describe('recordEvent (batismo e recepção)', () => {
  it('registra o fato com a data em que ocorreu e a observação aparada', () => {
    const member = aMember(1);

    member.recordEvent({
      type: 'BAPTISM',
      occurredOn: date('2010-03-14'),
      notes: '  Batizado   por   pastor X ',
      eventId: eventId(2),
      now: NOW,
    });

    expect(member.pendingEvents.at(-1)).toMatchObject({
      type: 'BAPTISM',
      occurredOn: date('2010-03-14'),
      notes: 'Batizado por pastor X',
      recordedAt: NOW,
    });
  });

  it('data no futuro é recusada; hoje é aceita', () => {
    const member = aMember(1);
    const record = (occurredOn: string) =>
      member.recordEvent({
        type: 'RECEPTION',
        occurredOn: date(occurredOn),
        eventId: eventId(2),
        now: NOW,
      });

    expect(thrownBy(() => record('2026-10-21'))).toBeInstanceOf(
      ValidationError,
    );
    record('2026-10-20');
    expect(member.pendingEvents.at(-1)?.type).toBe('RECEPTION');
  });

  it('observação longa demais é recusada; vazia vira ausente', () => {
    const member = aMember(1);
    const record = (notes: string) =>
      member.recordEvent({
        type: 'BAPTISM',
        occurredOn: date('2010-03-14'),
        notes,
        eventId: eventId(2),
        now: NOW,
      });

    expect(thrownBy(() => record('x'.repeat(501)))).toBeInstanceOf(
      ValidationError,
    );
    record('   ');
    expect(member.pendingEvents.at(-1)?.notes).toBeNull();
  });
});

describe('anonymize', () => {
  it('apaga os dados pessoais, mantém congregação e situação e registra o evento', () => {
    const member = aMember(1, { full: true, congregation: 2 });

    member.anonymize(eventId(2), after(NOW, DAY));

    expect(member.isAnonymized).toBe(true);
    expect(member.anonymizedAt).toEqual(after(NOW, DAY));
    expect(member.fullName.value).toBe(ANONYMIZED_NAME);
    expect(member.birthDate).toBeNull();
    expect(member.phone).toBeNull();
    expect(member.email).toBeNull();
    expect(member.address).toBeNull();
    expect(member.congregationId).toBe(congId(2));
    expect(member.status).toBe('ACTIVE');
    expect(member.pendingEvents.at(-1)?.type).toBe('ANONYMIZED');
  });

  it('é irreversível: depois dela, NENHUMA operação é aceita', () => {
    const member = aMember(1, { full: true });
    member.anonymize(eventId(2), NOW);

    const attempts = [
      () => member.anonymize(eventId(3), NOW),
      () => member.updateProfile({ fullName: PersonName.create('Outro') }, NOW),
      () => member.changeStatus('AWAY', eventId(3), NOW),
      () => member.transferTo(congId(2), eventId(3), NOW),
      () =>
        member.recordEvent({
          type: 'BAPTISM',
          occurredOn: date('2010-01-01'),
          eventId: eventId(3),
          now: NOW,
        }),
    ];
    for (const attempt of attempts) {
      expect(thrownBy(attempt)).toBeInstanceOf(MemberAnonymizedError);
    }
  });

  it('o evento de anonimização não carrega dado pessoal', () => {
    const member = aMember(1, { full: true });

    member.anonymize(eventId(2), NOW);

    const event = member.pendingEvents.at(-1)!;
    expect(event.notes).toBeNull();
    expect(JSON.stringify(event)).not.toMatch(/Maria|99999|exemplo/);
  });
});
