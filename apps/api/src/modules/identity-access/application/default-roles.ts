import type { IdGenerator } from '../../../shared/application/id-generator.js';
import type { OrganizationId } from '../../../shared/domain/identifiers.js';
import { RoleNameAlreadyInUseError } from '../domain/errors.js';
import { RoleId } from '../domain/ids.js';
import {
  ADMINISTRATOR_ROLE_NAME,
  LEADER_ROLE_NAME,
  Role,
  SECRETARY_ROLE_NAME,
} from '../domain/role.js';
import type { RoleRepository } from '../domain/role.repository.js';

export interface DefaultRoles {
  administrator: Role;
  leader: Role;
  secretary: Role;
}

type Factory = (input: { id: RoleId; organizationId: OrganizationId }) => Role;

const DEFAULTS: readonly (readonly [name: string, create: Factory])[] = [
  [ADMINISTRATOR_ROLE_NAME, (input) => Role.administrator(input)],
  [LEADER_ROLE_NAME, (input) => Role.leader(input)],
  [SECRETARY_ROLE_NAME, (input) => Role.secretary(input)],
];

/**
 * Garante que a igreja tenha os papéis padrão (ADR 0014), criando só os que faltam. Idempotente e seguro com chamadas
 * simultâneas: se outra chamada criou o mesmo papel no meio do caminho, o índice único do nome recusa a nossa
 * criação e usamos o papel dela.
 *
 * Papéis de sistema são identificados pelo nome: uma igreja não pode ter dois papéis com o mesmo nome.
 */
export async function ensureDefaultRoles(
  roles: RoleRepository,
  ids: IdGenerator,
  organizationId: OrganizationId,
): Promise<DefaultRoles> {
  const existing = await roles.listByOrganization(organizationId);
  const byName = new Map(existing.map((role) => [role.name.value, role]));

  for (const [name, create] of DEFAULTS) {
    if (byName.has(name)) continue;

    const role = create({ id: RoleId.of(ids.next()), organizationId });
    try {
      await roles.add(role);
      byName.set(name, role);
    } catch (error) {
      if (!(error instanceof RoleNameAlreadyInUseError)) throw error;
      // Perdemos a corrida: relê e usa o papel criado pelo concorrente.
      const reloaded = (await roles.listByOrganization(organizationId)).find(
        (candidate) => candidate.name.value === name,
      );
      if (!reloaded) throw error;
      byName.set(name, reloaded);
    }
  }

  const get = (name: string): Role => {
    const role = byName.get(name);
    if (!role) throw new Error(`Papel padrão ausente: ${name}`);
    return role;
  };
  return {
    administrator: get(ADMINISTRATOR_ROLE_NAME),
    leader: get(LEADER_ROLE_NAME),
    secretary: get(SECRETARY_ROLE_NAME),
  };
}
