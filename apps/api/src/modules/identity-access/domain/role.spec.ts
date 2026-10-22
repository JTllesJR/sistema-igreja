import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { thrownBy } from '../../../shared/testing/thrown-by.js';
import {
  MEMBERS_ANONYMIZE,
  MEMBERS_READ,
  MEMBERS_WRITE,
} from '../../members/members.permissions.js';
import {
  FINANCE_APPROVE,
  FINANCE_READ,
  FINANCE_READ_INDIVIDUAL,
  FINANCE_WRITE,
} from '../../finance/finance.permissions.js';
import { ORGANIZATION_READ } from '../../organization/organization.permissions.js';
import { Permission } from './permission.js';
import { Role } from './role.js';
import { RoleName } from './role-name.js';
import { orgId, roleId } from './testing/fixtures.js';

describe('RoleName', () => {
  it('apara e reduz espaços', () => {
    expect(RoleName.create('  1º   Tesoureiro ').value).toBe('1º Tesoureiro');
  });

  it.each(['', ' ', 'A', 'a'.repeat(61)])('rejeita "%s"', (raw) => {
    const error = thrownBy(() => RoleName.create(raw));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ field: 'name' });
  });
});

describe('Role', () => {
  describe('Administrador', () => {
    const administrator = Role.administrator({
      id: roleId(1),
      organizationId: orgId(),
    });

    it('é um papel de sistema chamado "Administrador" com a permissão curinga', () => {
      expect(administrator.name.value).toBe('Administrador');
      expect(administrator.isSystem).toBe(true);
      expect(administrator.permissions.map((p) => p.value)).toEqual(['*']);
    });

    it('concede qualquer permissão, inclusive as que ainda não existem', () => {
      expect(administrator.grants(Permission.of('finance:approve'))).toBe(true);
      expect(
        administrator.grants(Permission.of('modulo-futuro:acao-nova')),
      ).toBe(true);
    });
  });

  describe('papel com permissões explícitas', () => {
    const treasurer = Role.restore({
      id: roleId(2),
      organizationId: orgId(),
      name: RoleName.create('Tesoureiro'),
      isSystem: false,
      permissions: [
        Permission.of('finance:read'),
        Permission.of('finance:create'),
        Permission.of('finance:read'),
      ],
    });

    it('concede somente o que foi listado', () => {
      expect(treasurer.grants(Permission.of('finance:read'))).toBe(true);
      expect(treasurer.grants(Permission.of('finance:create'))).toBe(true);
      expect(treasurer.grants(Permission.of('members:read'))).toBe(false);
    });

    it('ignora permissões repetidas', () => {
      expect(treasurer.permissions).toHaveLength(2);
    });

    it('não é papel de sistema', () => {
      expect(treasurer.isSystem).toBe(false);
    });
  });

  describe('papéis padrão (ADR 0014)', () => {
    const input = { id: roleId(7), organizationId: orgId() };
    const permissionsOf = (role: Role) =>
      role.permissions.map((p) => p.value).sort();

    it('Secretário: cadastra e consulta membros e vê a igreja, nada além disso', () => {
      const secretary = Role.secretary(input);

      expect(secretary.name.value).toBe('Secretário');
      expect(secretary.isSystem).toBe(true);
      expect(permissionsOf(secretary)).toEqual([
        'members:read',
        'members:write',
        'organization:read',
      ]);
      expect(secretary.grants(Permission.of('members:anonymize'))).toBe(false);
      expect(secretary.grants(Permission.of('organization:manage'))).toBe(
        false,
      );
    });

    it('Dirigente: tudo do Secretário, a anonimização de membros e o financeiro da congregação (sem lançar nem gerir a igreja)', () => {
      const leader = Role.leader(input);

      expect(leader.name.value).toBe('Dirigente');
      expect(leader.isSystem).toBe(true);
      expect(permissionsOf(leader)).toEqual([
        'finance:approve',
        'finance:read',
        'finance:read-individual',
        'members:anonymize',
        'members:read',
        'members:write',
        'organization:read',
      ]);
      expect(leader.grants(Permission.of('organization:manage'))).toBe(false);
    });

    it('Tesoureiro: lança e consulta o financeiro e vê quem contribuiu, mas NÃO aprova nem lê a ficha dos membros', () => {
      const treasurer = Role.treasurer(input);

      expect(treasurer.name.value).toBe('Tesoureiro');
      expect(treasurer.isSystem).toBe(true);
      expect(permissionsOf(treasurer)).toEqual([
        'finance:read',
        'finance:read-individual',
        'finance:write',
        'organization:read',
      ]);
      expect(treasurer.grants(Permission.of('finance:approve'))).toBe(false);
      expect(treasurer.grants(Permission.of('members:read'))).toBe(false);
    });

    it('Diretoria: aprova e acompanha, mas NÃO lança', () => {
      const board = Role.board(input);

      expect(board.name.value).toBe('Diretoria');
      expect(board.isSystem).toBe(true);
      expect(permissionsOf(board)).toEqual([
        'finance:approve',
        'finance:read',
        'finance:read-individual',
        'members:read',
        'organization:read',
      ]);
      expect(board.grants(Permission.of('finance:write'))).toBe(false);
    });

    it('quem lança nunca é quem aprova: nenhum papel padrão (fora o Administrador) junta as duas permissões', () => {
      for (const role of [
        Role.secretary(input),
        Role.leader(input),
        Role.treasurer(input),
        Role.board(input),
      ]) {
        const both =
          role.grants(Permission.of('finance:write')) &&
          role.grants(Permission.of('finance:approve'));
        expect(both).toBe(false);
      }
    });

    it('os textos das permissões batem com as constantes dos módulos dono delas', () => {
      // Único lugar em que o identity-access olha as constantes de outros módulos: o domain usa texto para não
      // importar o módulo inteiro (ciclo + Nest no domain). Se alguém renomear uma permissão, este teste falha.
      const granted = new Set(
        [
          Role.secretary(input),
          Role.leader(input),
          Role.treasurer(input),
          Role.board(input),
        ].flatMap((role) => role.permissions.map((p) => p.value)),
      );

      expect(granted).toEqual(
        new Set([
          MEMBERS_READ,
          MEMBERS_WRITE,
          MEMBERS_ANONYMIZE,
          ORGANIZATION_READ,
          FINANCE_READ,
          FINANCE_WRITE,
          FINANCE_APPROVE,
          FINANCE_READ_INDIVIDUAL,
        ]),
      );
    });
  });
});
