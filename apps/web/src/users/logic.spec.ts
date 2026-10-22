import type { Role, UserSummary } from '@igreja/contracts';
import { describe, expect, it } from 'vitest';
import {
  describeAssignment,
  emptyCreateUserForm,
  emptyPasswordChangeForm,
  formatLastLogin,
  isWholeChurchOnly,
  toAssignmentRequest,
  toCreateRequest,
  validateCreateUser,
  validatePasswordChange,
} from './logic';

const admin: Role = {
  id: 'r-admin',
  name: 'Administrador',
  isSystem: true,
  permissions: ['*'],
};
const secretary: Role = {
  id: 'r-sec',
  name: 'Secretário',
  isSystem: true,
  permissions: ['members:read', 'members:write'],
};
const roles = [admin, secretary];

describe('isWholeChurchOnly', () => {
  it('só o papel com o curinga vale apenas para a igreja toda', () => {
    expect(isWholeChurchOnly(admin)).toBe(true);
    expect(isWholeChurchOnly(secretary)).toBe(false);
  });
});

describe('validateCreateUser', () => {
  it('formulário vazio: e-mail e papel são exigidos', () => {
    expect(validateCreateUser(emptyCreateUserForm(), roles)).toEqual({
      email: 'Informe um e-mail válido.',
      roleId: 'Escolha o papel.',
    });
  });

  it('papel de congregação exige escolher a congregação; o Administrador não', () => {
    const base = { email: 'ana@igreja.com', congregationId: '' };

    expect(validateCreateUser({ ...base, roleId: 'r-sec' }, roles)).toEqual({
      congregationId: 'Escolha a congregação deste papel.',
    });
    expect(validateCreateUser({ ...base, roleId: 'r-admin' }, roles)).toEqual(
      {},
    );
    expect(
      validateCreateUser(
        { ...base, roleId: 'r-sec', congregationId: 'c1' },
        roles,
      ),
    ).toEqual({});
  });

  it.each(['semarroba', 'a@b', ' ', '@x.com'])(
    'e-mail %j é recusado',
    (email) => {
      expect(
        validateCreateUser(
          { email, roleId: 'r-admin', congregationId: '' },
          roles,
        ).email,
      ).toBeDefined();
    },
  );
});

describe('conversão para a API', () => {
  it('cria: apara o e-mail e envia a congregação do papel comum', () => {
    expect(
      toCreateRequest(
        { email: ' ana@igreja.com ', roleId: 'r-sec', congregationId: 'c1' },
        roles,
      ),
    ).toEqual({
      email: 'ana@igreja.com',
      roleId: 'r-sec',
      congregationId: 'c1',
    });
  });

  it('papel de igreja toda NUNCA leva congregação, mesmo que o formulário guarde uma antiga', () => {
    expect(
      toCreateRequest(
        { email: 'a@b.com', roleId: 'r-admin', congregationId: 'c1' },
        roles,
      ).congregationId,
    ).toBeNull();
    expect(
      toAssignmentRequest({ roleId: 'r-admin', congregationId: 'c1' }, roles),
    ).toEqual({ roleId: 'r-admin', congregationId: null });
  });

  it('atribuição de papel comum leva a congregação; sem escolha, vira null', () => {
    expect(
      toAssignmentRequest({ roleId: 'r-sec', congregationId: 'c2' }, roles),
    ).toEqual({
      roleId: 'r-sec',
      congregationId: 'c2',
    });
    expect(
      toAssignmentRequest({ roleId: 'r-sec', congregationId: '' }, roles)
        .congregationId,
    ).toBeNull();
  });
});

describe('textos', () => {
  const role = (
    congregationId: string | null,
  ): UserSummary['roles'][number] => ({
    roleId: 'r',
    roleName: 'Secretário',
    congregationId,
  });

  it('descreve papel e escopo', () => {
    expect(describeAssignment(role(null), () => 'x')).toBe(
      'Secretário · Igreja toda',
    );
    expect(
      describeAssignment(role('c1'), (id) => (id === 'c1' ? 'Sede' : '?')),
    ).toBe('Secretário · Sede');
  });

  it('último acesso: horário de Brasília, fixo, e "Nunca entrou"', () => {
    expect(formatLastLogin(null)).toBe('Nunca entrou');
    expect(formatLastLogin('2026-10-21T17:30:00.000Z')).toBe(
      '21/10/2026 14:30',
    );
  });
});

describe('validatePasswordChange', () => {
  const ok = {
    currentPassword: 'senha-atual-1',
    newPassword: 'outra-senha-boa-2',
    confirmation: 'outra-senha-boa-2',
  };

  it('formulário vazio: tudo é exigido', () => {
    const errors = validatePasswordChange(emptyPasswordChangeForm());

    expect(Object.keys(errors).sort()).toEqual([
      'currentPassword',
      'newPassword',
    ]);
  });

  it('formulário correto não tem erros', () => {
    expect(validatePasswordChange(ok)).toEqual({});
  });

  it('a política é de 10 a 128 caracteres, sem regras de composição', () => {
    expect(
      validatePasswordChange({
        ...ok,
        newPassword: 'curta123',
        confirmation: 'curta123',
      }).newPassword,
    ).toMatch(/entre 10 e 128/);
    const nine = 'a'.repeat(9);
    expect(
      validatePasswordChange({ ...ok, newPassword: nine, confirmation: nine })
        .newPassword,
    ).toBeDefined();
    const ten = 'a'.repeat(10);
    expect(
      validatePasswordChange({ ...ok, newPassword: ten, confirmation: ten }),
    ).toEqual({});
    const big = 'a'.repeat(129);
    expect(
      validatePasswordChange({ ...ok, newPassword: big, confirmation: big })
        .newPassword,
    ).toBeDefined();
  });

  it('a nova precisa ser DIFERENTE da atual (senão a troca obrigatória não troca nada)', () => {
    const same = 'senha-temporaria-1';

    expect(
      validatePasswordChange({
        currentPassword: same,
        newPassword: same,
        confirmation: same,
      }).newPassword,
    ).toBe('A nova senha precisa ser diferente da atual.');
  });

  it('a confirmação precisa ser igual', () => {
    expect(
      validatePasswordChange({ ...ok, confirmation: 'outra-coisa-bem-longa' }),
    ).toEqual({
      confirmation: 'A confirmação não é igual à nova senha.',
    });
  });
});
