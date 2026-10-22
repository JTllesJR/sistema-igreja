import { describe, expect, it } from 'vitest';
import { anAuthBed } from './testing/test-bed.js';

describe('GetAccessPolicyUseCase: troca de senha pendente (ADR 0014)', () => {
  it('usuário comum: sem pendência', async () => {
    const bed = await anAuthBed();

    const policy = await bed.accessPolicy.execute(bed.adminContext);

    expect(policy.mustChangePassword).toBe(false);
  });

  it('usuário com senha temporária: a política carrega a pendência', async () => {
    const bed = await anAuthBed();
    const user = await bed.addUser('nova@igreja.com', {
      mustChangePassword: true,
    });

    const policy = await bed.accessPolicy.execute(bed.contextOf(user.id));

    expect(policy.mustChangePassword).toBe(true);
  });

  it('depois de escolher a própria senha, a pendência some na hora', async () => {
    const bed = await anAuthBed();
    const user = await bed.addUser('nova@igreja.com', {
      mustChangePassword: true,
    });
    const context = bed.contextOf(user.id);

    await bed.changePassword.execute(context, {
      currentPassword: 'senha-do-usuario-1',
      newPassword: 'uma-senha-nova-e-forte-9',
    });

    expect((await bed.accessPolicy.execute(context)).mustChangePassword).toBe(
      false,
    );
  });
});
