import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  AdministratorScopeError,
  CongregationUnavailableError,
  EmailAlreadyRegisteredError,
  RoleNotFoundError,
} from '../domain/errors.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import {
  CONGREGATION,
  INACTIVE_CONGREGATION,
  ORGANIZATION,
  anAuthBed,
} from './testing/test-bed.js';

async function setup() {
  const bed = await anAuthBed();
  const useCase = new CreateUserUseCase(
    bed.users,
    bed.roles,
    bed.hasher,
    bed.generator,
    bed.organizations,
    bed.ids,
    bed.audit,
  );
  const secretary = await bed.roleNamed('Secretário');
  const create = (
    email = 'maria@igreja.com',
    roleId: string = secretary.id,
    congregationId: string | null = CONGREGATION,
  ) => useCase.execute(bed.adminContext, { email, roleId, congregationId });
  return { bed, secretary, create };
}

describe('CreateUserUseCase (POST /users, ADR 0014)', () => {
  it('cria o usuário ativo, com o papel e o escopo pedidos, e devolve a senha temporária', async () => {
    const { bed, secretary, create } = await setup();

    const result = await create();

    expect(result.user).toMatchObject({
      email: 'maria@igreja.com',
      status: 'ACTIVE',
      lastLoginAt: null,
      roles: [
        {
          roleId: secretary.id,
          roleName: 'Secretário',
          congregationId: CONGREGATION,
        },
      ],
    });
    const stored = (await bed.users.listByOrganization(ORGANIZATION)).find(
      (u) => u.email.value === 'maria@igreja.com',
    );
    expect(stored?.organizationId).toBe(ORGANIZATION);
    expect(stored?.mustChangePassword).toBe(true);
    expect(result.temporaryPassword).toMatch(/^Temp-0001/);
  });

  it('a senha temporária funciona no login, e o login avisa que a troca é obrigatória', async () => {
    const { bed, create } = await setup();

    const { temporaryPassword } = await create();
    const login = await bed.login(temporaryPassword, 'maria@igreja.com');

    expect(login.user.mustChangePassword).toBe(true);
  });

  it('guarda só o hash: a senha em texto não fica no armazenamento', async () => {
    const { bed, create } = await setup();
    const hashesBefore = bed.hasher.hashCalls;

    const { temporaryPassword } = await create();

    expect(bed.hasher.hashCalls).toBe(hashesBefore + 1);
    const users = await bed.users.listByOrganization(ORGANIZATION);
    const stored = users.find((u) => u.email.value === 'maria@igreja.com');
    expect(JSON.stringify(stored?.passwordHash)).not.toContain(
      temporaryPassword,
    );
    expect(stored?.passwordHash.value).not.toContain(temporaryPassword);
  });

  it('cada usuário recebe uma senha diferente', async () => {
    const { create } = await setup();

    const first = await create('a@igreja.com');
    const second = await create('b@igreja.com');

    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
  });

  it('normaliza o e-mail (espaços e caixa) e recusa e-mail inválido', async () => {
    const { create } = await setup();

    const result = await create('  Maria@Igreja.COM ');
    expect(result.user.email).toBe('maria@igreja.com');

    const error = await create('isto-nao-e-email').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('e-mail já cadastrado é recusado, mesmo com outra caixa ou em outra igreja (único no sistema)', async () => {
    const { bed, create } = await setup();
    await create('maria@igreja.com');
    await bed.addUser('de-fora@outra.com', {
      organizationId: OrganizationId.of(uuidFor(2)),
    });

    await expect(create('MARIA@igreja.com')).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
    await expect(create('de-fora@outra.com')).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );
  });

  it('e-mail repetido é recusado ANTES de gastar um hash (que é caro) ou gerar senha', async () => {
    const { bed, create } = await setup();
    await create('maria@igreja.com');
    const hashes = bed.hasher.hashCalls;

    await expect(create('maria@igreja.com')).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError,
    );

    expect(bed.hasher.hashCalls).toBe(hashes);
  });

  it('as regras de atribuição valem aqui também, e nada é criado quando falham', async () => {
    const { bed, secretary, create } = await setup();
    const before = (await bed.users.listByOrganization(ORGANIZATION)).length;

    await expect(
      create('a@igreja.com', bed.admin.roleId, CONGREGATION),
    ).rejects.toBeInstanceOf(AdministratorScopeError);
    await expect(
      create('b@igreja.com', secretary.id, INACTIVE_CONGREGATION),
    ).rejects.toBeInstanceOf(CongregationUnavailableError);
    await expect(
      create('c@igreja.com', uuidFor(8888), null),
    ).rejects.toBeInstanceOf(RoleNotFoundError);

    expect((await bed.users.listByOrganization(ORGANIZATION)).length).toBe(
      before,
    );
    expect(bed.audit.entries).toEqual([]);
  });

  it('o Administrador pode ser criado para a igreja toda', async () => {
    const { bed, create } = await setup();

    const result = await create(
      'novo-admin@igreja.com',
      bed.admin.roleId,
      null,
    );

    expect(result.user.roles[0]?.roleName).toBe('Administrador');
  });

  it('audita a criação com ids apenas: sem e-mail e sem senha', async () => {
    const { bed, secretary, create } = await setup();

    const { user, temporaryPassword } = await create();

    expect(bed.audit.entries).toEqual([
      {
        organizationId: ORGANIZATION,
        actorId: bed.adminContext.actorId,
        action: 'user.created',
        entity: 'user',
        entityId: user.id,
        metadata: { roleId: secretary.id, congregationId: CONGREGATION },
      },
    ]);
    const trail = JSON.stringify(bed.audit.entries);
    expect(trail).not.toContain('maria@');
    expect(trail).not.toContain(temporaryPassword);
  });
});
