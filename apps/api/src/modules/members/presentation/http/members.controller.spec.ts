import { describe, expect, it } from 'vitest';
import {
  REQUIRED_PERMISSION_KEY,
  type PermissionRequirement,
} from '../../../../platform/http/access-control.js';
import { MembersController } from './members.controller.js';

const requirementOf = (
  method: keyof MembersController,
): PermissionRequirement | undefined =>
  Reflect.getMetadata(
    REQUIRED_PERMISSION_KEY,
    MembersController.prototype[method],
  ) as PermissionRequirement | undefined;

/**
 * O guard global NEGA POR PADRÃO, mas cada rota precisa declarar a permissão certa. Este teste fixa, rota a rota,
 * a permissão e o escopo: esquecer um `@RequirePermission` ou afrouxar um escopo quebra aqui.
 */
describe('permissões declaradas nas rotas de membros', () => {
  it.each([
    ['list', 'members:read', false],
    ['detail', 'members:read', false],
    ['create', 'members:write', false],
    ['update', 'members:write', false],
    ['status', 'members:write', false],
    ['transfer', 'members:write', false],
    ['history', 'members:write', false],
    // IRREVERSÍVEL: a igreja toda, já no guard (e de novo no caso de uso).
    ['anonymize', 'members:anonymize', true],
  ] as const)(
    '%s exige %s (igreja toda: %s)',
    (method, permission, organizationWide) => {
      expect(requirementOf(method)).toEqual({ permission, organizationWide });
    },
  );

  it('toda rota do controller declara uma permissão', () => {
    const methods = Object.getOwnPropertyNames(
      MembersController.prototype,
    ).filter((name) => name !== 'constructor');

    for (const name of methods) {
      expect(
        requirementOf(name as keyof MembersController),
        name,
      ).toBeDefined();
    }
  });
});
