import type { CurrentUser } from '@igreja/contracts';
import { describe, expect, it } from 'vitest';
import { hasPermission, hasPermissionAnywhere } from './permissions';

const user = (...roles: CurrentUser['roles']): CurrentUser => ({
  id: 'u',
  organizationId: 'o',
  mustChangePassword: false,
  email: 'a@b.com',
  roles,
});
const role = (
  permissions: string[],
  congregationId: string | null = null,
): CurrentUser['roles'][number] => ({
  roleId: 'r',
  roleName: 'Papel',
  isSystem: false,
  permissions,
  congregationId,
});

describe('hasPermission', () => {
  it('o curinga "*" cobre qualquer permissão', () => {
    expect(hasPermission(user(role(['*'])), 'members:write')).toBe(true);
  });

  it('permissão exata na igreja toda vale para qualquer congregação', () => {
    const u = user(role(['members:read']));

    expect(hasPermission(u, 'members:read')).toBe(true);
    expect(hasPermission(u, 'members:read', 'c1')).toBe(true);
    expect(hasPermission(u, 'members:write')).toBe(false);
  });

  it('papel de UMA congregação vale só nela, e nunca como "igreja toda"', () => {
    const u = user(role(['members:write'], 'c1'));

    expect(hasPermission(u, 'members:write', 'c1')).toBe(true);
    expect(hasPermission(u, 'members:write', 'c2')).toBe(false);
    expect(hasPermission(u, 'members:write')).toBe(false);
  });

  it('várias atribuições se somam', () => {
    const u = user(
      role(['members:write'], 'c1'),
      role(['members:write'], 'c2'),
    );

    expect(hasPermission(u, 'members:write', 'c1')).toBe(true);
    expect(hasPermission(u, 'members:write', 'c2')).toBe(true);
    expect(hasPermission(u, 'members:write', 'c3')).toBe(false);
  });

  it('sem papéis, nada', () => {
    expect(hasPermission(user(), 'members:read')).toBe(false);
  });
});

describe('hasPermissionAnywhere', () => {
  it('basta ter em algum escopo', () => {
    expect(
      hasPermissionAnywhere(user(role(['members:read'], 'c1')), 'members:read'),
    ).toBe(true);
    expect(
      hasPermissionAnywhere(user(role(['members:read'], 'c1')), 'finance:read'),
    ).toBe(false);
  });
});
