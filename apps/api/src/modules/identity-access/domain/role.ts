import { ValidationError } from '../../../shared/domain/domain-error.js';
import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import { ACCESS_MANAGE_USERS } from '../access.permissions.js';
import { SystemRoleImmutableError } from './errors.js';
import type { RoleId } from './ids.js';
import { Permission } from './permission.js';
import { RoleName } from './role-name.js';

export const ADMINISTRATOR_ROLE_NAME = 'Administrador';
export const LEADER_ROLE_NAME = 'Dirigente';
export const SECRETARY_ROLE_NAME = 'Secretário';
export const TREASURER_ROLE_NAME = 'Tesoureiro';
export const BOARD_ROLE_NAME = 'Diretoria';

const SYSTEM_ROLE_NAMES = [
  ADMINISTRATOR_ROLE_NAME,
  LEADER_ROLE_NAME,
  SECRETARY_ROLE_NAME,
  TREASURER_ROLE_NAME,
  BOARD_ROLE_NAME,
];

/** Permissões que nenhum papel personalizado recebe (ADR 0019). */
export const RESERVED_PERMISSIONS: readonly string[] = [
  Permission.ALL.value,
  ACCESS_MANAGE_USERS,
];

/**
 * Papel: um conjunto de permissões, por igreja (ADR 0004). Papéis de sistema não são editáveis pelo usuário.
 * Papéis padrão (Administrador, Dirigente, Secretário, Tesoureiro, Diretoria) são de sistema e fixos no código (ADR 0014); papéis
 * personalizados (UC-02 completo) usarão a mesma estrutura.
 */
export class Role {
  readonly #permissions: readonly Permission[];

  private constructor(
    readonly id: RoleId,
    readonly organizationId: OrganizationId,
    readonly name: RoleName,
    readonly isSystem: boolean,
    permissions: readonly Permission[],
  ) {
    this.#permissions = permissions;
  }

  /** Papel de sistema com a permissão curinga: concede tudo, inclusive permissões futuras (ADR 0010). */
  static administrator(input: {
    id: RoleId;
    organizationId: OrganizationId;
  }): Role {
    return new Role(
      input.id,
      input.organizationId,
      RoleName.create(ADMINISTRATOR_ROLE_NAME),
      true,
      [Permission.ALL],
    );
  }

  /**
   * Dirigente: acesso total aos membros da sua congregação (PRD). As permissões são texto (e não as constantes do
   * módulo `members`) para o domínio não importar outros módulos; `role.spec.ts` confere os textos com os módulos dono.
   */
  static leader(input: { id: RoleId; organizationId: OrganizationId }): Role {
    return Role.system(input, LEADER_ROLE_NAME, [
      'members:read',
      'members:write',
      'members:anonymize',
      'organization:read',
      // Financeiro (ADR 0015): vê os números da congregação e quem contribuiu; e, atuando na sede, aprova.
      'finance:read',
      'finance:approve',
      'finance:read-individual',
    ]);
  }

  /** Secretário: cadastra e consulta membros e enxerga a igreja. Não anonimiza nem gere a igreja. */
  static secretary(input: {
    id: RoleId;
    organizationId: OrganizationId;
  }): Role {
    return Role.system(input, SECRETARY_ROLE_NAME, [
      'members:read',
      'members:write',
      'organization:read',
    ]);
  }

  /**
   * Tesoureiro: lança e consulta o financeiro, vê quem contribuiu (precisa para identificar o dízimo) e enxerga a igreja.
   * NÃO aprova (separação de funções) e NÃO ganha `members:read`: a ficha do membro tem endereço e telefone, e ele
   * escolhe o membro por uma busca mínima do próprio financeiro (ADR 0015).
   */
  static treasurer(input: {
    id: RoleId;
    organizationId: OrganizationId;
  }): Role {
    return Role.system(input, TREASURER_ROLE_NAME, [
      'finance:read',
      'finance:write',
      'finance:read-individual',
      'organization:read',
    ]);
  }

  /**
   * Diretoria: acompanha e APROVA o financeiro, vê quem contribuiu, consulta membros e a trilha de auditoria. Não lança. Atribuída na igreja
   * toda, alcança a sede e decide os pedidos de todas as congregações.
   */
  static board(input: { id: RoleId; organizationId: OrganizationId }): Role {
    return Role.system(input, BOARD_ROLE_NAME, [
      'finance:read',
      'finance:approve',
      'finance:read-individual',
      'members:read',
      'organization:read',
      // Trilha de auditoria (ADR 0017): a Diretoria fiscaliza quem leu e fez o quê, na igreja toda.
      'audit:read',
    ]);
  }

  /**
   * Papel personalizado (UC-02, ADR 0019). Regras que valem sempre, venha o pedido de onde vier:
   *  - pelo menos uma permissão (um papel vazio não concede nada e só confunde);
   *  - nunca o curinga `*` nem `access:manage-users`: quem gere acessos poderia criar um papel com tudo e dá-lo a si mesmo,
   *    então gerir acessos fica só com o Administrador;
   *  - não usa o nome de um papel padrão (o código acha os papéis padrão pelo nome).
   * Que a permissão EXISTA no sistema é conferido pela aplicação, contra o catálogo; o domínio só conhece o formato.
   */
  static custom(input: {
    id: RoleId;
    organizationId: OrganizationId;
    name: RoleName;
    permissions: readonly Permission[];
  }): Role {
    if (input.permissions.length === 0) {
      throw new ValidationError(
        'permissions',
        'O papel precisa de pelo menos uma permissão.',
      );
    }
    if (input.permissions.some((p) => RESERVED_PERMISSIONS.includes(p.value))) {
      throw new ValidationError(
        'permissions',
        'Papéis personalizados não podem administrar usuários e papéis: isso fica só com o Administrador.',
      );
    }
    const lowered = input.name.value.toLowerCase();
    if (SYSTEM_ROLE_NAMES.some((name) => name.toLowerCase() === lowered)) {
      throw new ValidationError(
        'name',
        'Este nome é de um papel padrão. Escolha outro.',
      );
    }
    return Role.restore({ ...input, isSystem: false });
  }

  /** Muda nome e/ou permissões de um papel personalizado, com as mesmas regras de `custom`. Devolve um papel novo. */
  edit(changes: {
    name?: RoleName;
    permissions?: readonly Permission[];
  }): Role {
    if (this.isSystem) throw new SystemRoleImmutableError();
    return Role.custom({
      id: this.id,
      organizationId: this.organizationId,
      name: changes.name ?? this.name,
      permissions: changes.permissions ?? this.#permissions,
    });
  }

  /** Só papéis personalizados podem ser excluídos; se ainda estão atribuídos, quem decide é a aplicação. */
  assertDeletable(): void {
    if (this.isSystem) throw new SystemRoleImmutableError();
  }

  private static system(
    input: { id: RoleId; organizationId: OrganizationId },
    name: string,
    permissions: readonly string[],
  ): Role {
    return new Role(
      input.id,
      input.organizationId,
      RoleName.create(name),
      true,
      permissions.map((p) => Permission.of(p)),
    );
  }

  static restore(input: {
    id: RoleId;
    organizationId: OrganizationId;
    name: RoleName;
    isSystem: boolean;
    permissions: readonly Permission[];
  }): Role {
    const unique = [
      ...new Map(input.permissions.map((p) => [p.value, p])).values(),
    ];
    return new Role(
      input.id,
      input.organizationId,
      input.name,
      input.isSystem,
      unique,
    );
  }

  get permissions(): readonly Permission[] {
    return [...this.#permissions];
  }

  grants(required: Permission): boolean {
    return this.#permissions.some((granted) => granted.covers(required));
  }
}
