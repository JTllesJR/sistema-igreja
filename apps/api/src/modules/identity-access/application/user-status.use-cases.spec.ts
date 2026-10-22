import { describe, expect, it } from 'vitest';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  InvalidCredentialsError,
  LastAdministratorError,
  UserNotFoundError,
} from '../domain/errors.js';
import { DisableUserUseCase } from './disable-user.use-case.js';
import { EnableUserUseCase } from './enable-user.use-case.js';
import { ORGANIZATION, USER_PASSWORD, anAuthBed } from './testing/test-bed.js';

async function setup() {
  const bed = await anAuthBed();
  const disable = new DisableUserUseCase(
    bed.users,
    bed.roles,
    bed.sessions,
    bed.clock,
    bed.audit,
  );
  const enable = new EnableUserUseCase(bed.users, bed.roles, bed.audit);
  return {
    bed,
    disable: (userId: string) => disable.execute(bed.adminContext, { userId }),
    enable: (userId: string) => enable.execute(bed.adminContext, { userId }),
  };
}

describe('DisableUserUseCase (POST /users/:id/disable)', () => {
  it('desativa o usuário, devolve a situação nova e registra na auditoria', async () => {
    const { bed, disable } = await setup();
    const user = await bed.addUser('maria@igreja.com');

    const view = await disable(user.id);

    expect(view.status).toBe('DISABLED');
    expect((await bed.users.findById(user.id))?.status).toBe('DISABLED');
    expect(bed.audit.entries).toEqual([
      {
        organizationId: ORGANIZATION,
        actorId: bed.adminContext.actorId,
        action: 'user.disabled',
        entity: 'user',
        entityId: user.id,
      },
    ]);
  });

  it('revoga TODAS as sessões do usuário (a renovação deixa de funcionar), sem tocar nas dos outros', async () => {
    const { bed, disable } = await setup();
    const user = await bed.addUser('maria@igreja.com');
    const marias = await bed.login(USER_PASSWORD, 'maria@igreja.com');
    const admins = await bed.login();

    await disable(user.id);

    await expect(
      bed.refresh.execute({ refreshToken: marias.refreshToken }),
    ).rejects.toThrow();
    await expect(
      bed.refresh.execute({ refreshToken: admins.refreshToken }),
    ).resolves.toBeDefined();
  });

  it('as sessões continuam revogadas depois de reativar (reativar não ressuscita login antigo)', async () => {
    const { bed, disable, enable } = await setup();
    const user = await bed.addUser('maria@igreja.com');
    const marias = await bed.login(USER_PASSWORD, 'maria@igreja.com');

    await disable(user.id);
    await enable(user.id);

    await expect(
      bed.refresh.execute({ refreshToken: marias.refreshToken }),
    ).rejects.toThrow();
  });

  it('o usuário desativado não consegue mais entrar', async () => {
    const { bed, disable } = await setup();
    const user = await bed.addUser('maria@igreja.com');

    await disable(user.id);

    await expect(
      bed.login(USER_PASSWORD, 'maria@igreja.com'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('desativar quem já está desativado é inofensivo', async () => {
    const { bed, disable } = await setup();
    const user = await bed.addUser('maria@igreja.com', { status: 'DISABLED' });

    await expect(disable(user.id)).resolves.toMatchObject({
      status: 'DISABLED',
    });
  });

  it('recusa desativar o ÚNICO administrador ativo: continua ativo e com as sessões', async () => {
    const { bed, disable } = await setup();
    const session = await bed.login();

    await expect(disable(bed.admin.userId)).rejects.toBeInstanceOf(
      LastAdministratorError,
    );

    expect((await bed.users.findById(bed.admin.userId))?.status).toBe('ACTIVE');
    await expect(
      bed.refresh.execute({ refreshToken: session.refreshToken }),
    ).resolves.toBeDefined();
    expect(bed.audit.entries).toEqual([]);
  });

  it('permite desativar um administrador quando existe outro ativo', async () => {
    const { bed, disable } = await setup();
    const second = await bed.createAdministrator.execute({
      organizationId: ORGANIZATION,
      email: 'segundo@igreja.com',
      password: 'outra-senha-bem-segura',
    });

    await expect(disable(second.userId)).resolves.toMatchObject({
      status: 'DISABLED',
    });
  });

  it('usuário de outra igreja ou inexistente: UserNotFound, sem efeito', async () => {
    const { bed, disable } = await setup();
    const foreign = await bed.addUser('de-fora@outra.com', {
      organizationId: OrganizationId.of(uuidFor(2)),
    });

    await expect(disable(foreign.id)).rejects.toBeInstanceOf(UserNotFoundError);
    await expect(disable(uuidFor(7777))).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
    expect((await bed.users.findById(foreign.id))?.status).toBe('ACTIVE');
  });
});

describe('EnableUserUseCase (POST /users/:id/enable)', () => {
  it('reativa, devolve a situação nova e audita', async () => {
    const { bed, enable } = await setup();
    const user = await bed.addUser('maria@igreja.com', { status: 'DISABLED' });

    const view = await enable(user.id);

    expect(view.status).toBe('ACTIVE');
    expect(bed.audit.entries.map((e) => e.action)).toEqual(['user.enabled']);
    await expect(
      bed.login(USER_PASSWORD, 'maria@igreja.com'),
    ).resolves.toBeDefined();
  });

  it('usuário de outra igreja: UserNotFound', async () => {
    const { bed, enable } = await setup();
    const foreign = await bed.addUser('de-fora@outra.com', {
      organizationId: OrganizationId.of(uuidFor(2)),
      status: 'DISABLED',
    });

    await expect(enable(foreign.id)).rejects.toBeInstanceOf(UserNotFoundError);
    expect((await bed.users.findById(foreign.id))?.status).toBe('DISABLED');
  });
});
