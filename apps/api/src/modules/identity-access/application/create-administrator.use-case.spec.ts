import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../shared/domain/domain-error.js';
import { OrganizationId } from '../../../shared/domain/identifiers.js';
import { uuidFor } from '../../../shared/testing/uuid-for.js';
import {
  EmailAlreadyRegisteredError,
  UnknownOrganizationError,
} from '../domain/errors.js';
import { Email } from '../domain/email.js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ORGANIZATION,
  anAuthBed,
} from './testing/test-bed.js';

describe('CreateAdministratorUseCase (UC-03, parte do operador)', () => {
  it('cria um usuário ativo com o papel Administrador para a igreja toda', async () => {
    const bed = await anAuthBed();

    const user = await bed.users.findById(bed.admin.userId);

    expect(user?.status).toBe('ACTIVE');
    expect(user?.organizationId).toBe(ORGANIZATION);
    expect(user?.email.value).toBe(ADMIN_EMAIL);
    expect(user?.assignments).toHaveLength(1);
    expect(user?.assignments[0]?.roleId).toBe(bed.admin.roleId);
    expect(user?.assignments[0]?.isOrganizationWide).toBe(true);
  });

  it('guarda apenas o hash da senha, nunca a senha', async () => {
    const bed = await anAuthBed();

    const user = await bed.users.findById(bed.admin.userId);

    expect(bed.hasher.hashCalls).toBe(1);
    expect(JSON.stringify(user?.passwordHash)).not.toContain(ADMIN_PASSWORD);
    expect(user?.passwordHash.value).not.toBe(ADMIN_PASSWORD);
  });

  it('cria o papel de sistema Administrador da igreja, com a permissão curinga', async () => {
    const bed = await anAuthBed();

    const role = await bed.roles.findAdministrator(ORGANIZATION);

    expect(role?.id).toBe(bed.admin.roleId);
    expect(role?.isSystem).toBe(true);
    expect(role?.permissions.map((p) => p.value)).toEqual(['*']);
  });

  it('reutiliza o papel Administrador existente ao criar um segundo administrador da mesma igreja', async () => {
    const bed = await anAuthBed();

    const second = await bed.createAdministrator.execute({
      organizationId: ORGANIZATION,
      email: 'segundo@igreja.com',
      password: 'outra-senha-bem-segura',
    });

    expect(second.roleId).toBe(bed.admin.roleId);
    expect(second.userId).not.toBe(bed.admin.userId);
  });

  it('cada igreja tem o seu próprio papel Administrador', async () => {
    const bed = await anAuthBed();
    const other = OrganizationId.of(uuidFor(2));
    bed.organizations.add(other);

    const result = await bed.createAdministrator.execute({
      organizationId: other,
      email: 'admin@outra-igreja.com',
      password: 'senha-super-segura-2',
    });

    expect(result.roleId).not.toBe(bed.admin.roleId);
    expect((await bed.roles.findAdministrator(other))?.organizationId).toBe(
      other,
    );
  });

  it('rejeita e-mail já cadastrado, ignorando a caixa', async () => {
    const bed = await anAuthBed();
    const hashCallsBefore = bed.hasher.hashCalls;

    await expect(
      bed.createAdministrator.execute({
        organizationId: ORGANIZATION,
        email: ' ADMIN@Igreja.com ',
        password: 'qualquer-senha-valida',
      }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    // Falha antes de gastar um hash (caro) à toa; o repositório seria a segunda barreira.
    expect(bed.hasher.hashCalls).toBe(hashCallsBefore);
  });

  it('rejeita uma igreja que não existe, sem criar nada', async () => {
    const bed = await anAuthBed();
    const unknown = OrganizationId.of(uuidFor(777));

    await expect(
      bed.createAdministrator.execute({
        organizationId: unknown,
        email: 'novo@igreja.com',
        password: 'senha-super-segura-3',
      }),
    ).rejects.toBeInstanceOf(UnknownOrganizationError);

    expect(
      await bed.users.findByEmail(Email.create('novo@igreja.com')),
    ).toBeNull();
    expect(await bed.roles.findAdministrator(unknown)).toBeNull();
  });

  it.each([
    [
      'e-mail inválido',
      { email: 'sem-arroba', password: 'senha-super-segura-3' },
    ],
    ['senha curta', { email: 'novo@igreja.com', password: 'curta' }],
    [
      'senha igual ao e-mail',
      { email: 'novo-usuario@igreja.com', password: 'novo-usuario@igreja.com' },
    ],
  ])('rejeita %s sem calcular hash nem criar nada', async (_nome, input) => {
    const bed = await anAuthBed();
    const hashCallsBefore = bed.hasher.hashCalls;

    await expect(
      bed.createAdministrator.execute({
        organizationId: ORGANIZATION,
        ...input,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(bed.hasher.hashCalls).toBe(hashCallsBefore);
  });

  it('rejeita um identificador de igreja malformado', async () => {
    const bed = await anAuthBed();

    await expect(
      bed.createAdministrator.execute({
        organizationId: 'abc',
        email: 'novo@igreja.com',
        password: 'senha-super-segura-3',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
